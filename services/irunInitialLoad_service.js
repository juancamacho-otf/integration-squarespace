const squarespaceService = require("./squarespace-service");
const hubspotService = require("./hubspot-service"); 
const { mapProfiles } = require("../mapping/contact-mapping");
const { mapOrder } = require("../mapping/order-mapping");
const { maptransactions } = require("../mapping/transactions-mapping");
const logger = require("./logger-service"); 
const stateService = require("./state-service");
const config = require("../config.js")

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getSafeResponseData = (response) => {
try {
if (!response) return { result: [], documents: [], pagination: {} };
if (response.data) return response.data;
return response;
} catch (e) {
return { result: [], documents: [], pagination: {} };
}
};

const processCustomerOrders = async (contactEmail, hubspotContactId, transactionsSummary) => {
if (!transactionsSummary || !transactionsSummary.firstOrderSubmittedOn) return;

const firstOrderTime = new Date(transactionsSummary.firstOrderSubmittedOn).getTime();
const startDateIso = new Date(firstOrderTime - 3600000).toISOString();
const endDateIso = new Date().toISOString(); 

let hasNextPage = true;
let orderCursor = null; 
let customerOrders = [];

while (hasNextPage) {
try {
    const response = await squarespaceService.getOrdersByDateWindow(startDateIso, endDateIso, orderCursor);
    const safePayload = getSafeResponseData(response);
    const rawOrders = safePayload.result || [];
    const pagination = safePayload.pagination || {};

    const matches = rawOrders.filter(o => o.customerEmail && o.customerEmail.toLowerCase().trim() === contactEmail);
    if (matches.length > 0) customerOrders.push(...matches);

    if (pagination.hasNextPage && pagination.nextPageCursor) {
        orderCursor = pagination.nextPageCursor;
        await sleep(config.migration.apiPageDelayMs);
    } else {
        hasNextPage = false; 
    }
} catch (err) {
    hasNextPage = false;
}
}

if (customerOrders.length === 0) return;

let hubspotPayments = [];
try {
const paymentsResponse = await squarespaceService.getPaymenByDateWindow(startDateIso, endDateIso);
const safePayments = getSafeResponseData(paymentsResponse);
hubspotPayments = (safePayments.documents || []).map(maptransactions);
} catch (e) {}

const hubspotOrders = customerOrders.map(mapOrder);

for (const i of hubspotOrders) {
try {
    const orderData = i.order;
    const dealData = i.deal;
    const lineItemsData = i.line_items;

    const paymentMatch = hubspotPayments.find(p => p.payment.related_order_id === dealData.temporary_id);
    if (paymentMatch) {
        orderData.hs_payment_processing_method = paymentMatch.payment.hs_payment_processing_method;
        orderData.payment_reference = paymentMatch.payment.payment_reference;
    }

    const orderProperties = Object.keys(orderData).filter(k =>k !== 'Name');
    const orderResult = await hubspotService.upsertOrder({
        searchProperty: 'hs_external_order_id',
        orderObject: orderData,
        hubspotProperties: orderProperties,
        associations: []
    });
    
    const orderObj = orderResult?.results?.[0] || orderResult;
    const hubspotOrderId = orderObj?.id;



    if (hubspotOrderId) {
        await hubspotService.createAssociationV4('contacts', hubspotContactId, 'orders', hubspotOrderId).catch(() => {});
    }

    const dealProperties = Object.keys(dealData).filter(k => k !== 'payment_reference' && k !== 'hs_payment_processing_method');
    const dealResult = await hubspotService.upsertDeal({
        searchProperty: 'sqsp_order_id',
        dealObject: dealData,
        hubspotProperties: dealProperties,
        associations: []
    });
    const hubspotDealId = dealResult?.results?.[0]?.id || dealResult?.id;

    if (hubspotDealId) {
        await hubspotService.createAssociationV4('contacts', hubspotContactId, 'deals', hubspotDealId).catch(() => {});
        if (hubspotOrderId) await hubspotService.createAssociationV4('orders', hubspotOrderId, 'deals', hubspotDealId).catch(() => {});
    }

   if (lineItemsData && lineItemsData.length > 0 && hubspotOrderId) {
    try {
        // Borra los line items existentes de la Order antes de recrearlos
        await hubspotService.deleteOrderLineItems({ orderId: hubspotOrderId });

        const lineItemAssociations = [{
            to: { id: hubspotOrderId },
            types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 514 }]
        }];
        const lineItemProps = ["name", "price", "quantity", "hs_sku", "sqsp_lineitm_variant"];

        await hubspotService.createLineItems({
            propertiesArr: lineItemProps,
            lineItemArr: lineItemsData,
            associationsArr: lineItemAssociations
        });
    } catch (err) {
        logger.error(`Failed to recreate line items for Order ${hubspotOrderId}: ${err.message}`);
    }
}

} catch (err) {
    logger.error(`Migration Order Error: ${contactEmail} | ${err.message}`);
}
}
};

const processSingleContact = async (item) => {
const contactEmail = item.contact?.email?.toLowerCase()?.trim();
if (!contactEmail) return { stopProcess: false };

const createdOn = item.contact?.sqsp_created_on ? new Date(item.contact.sqsp_created_on).getTime() : null;
const targetDateTimestamp = new Date(config.migration.targetStartDate).getTime();

if (createdOn && createdOn < targetDateTimestamp) {
return { stopProcess: true };
}

const isCustomer = item.contact.iscustomer === true || String(item.contact.iscustomer).toLowerCase() === 'true';
const transactionsSummary = item.contact.transactionsSummary;

if (!isCustomer) return { stopProcess: false };

try {
const contactData = item.contact;
const contactDataDefault = item.defaultContactAddress;
const contactProperties = Object.keys(contactData).filter(key =>  key !== 'transactionsSummary');

const contactResult = await hubspotService.upsertContact({
    searchProperty: 'email',
    contactObject: contactData,
    defaultContactAddress: contactDataDefault,
    hubspotProperties: contactProperties
});

const hubspotContactId = contactResult?.results?.[0]?.id || contactResult?.id;

if (hubspotContactId) {
    await processCustomerOrders(contactEmail, hubspotContactId, transactionsSummary);
}

await sleep(config.migration.hubspotRateLimitDelay);

} catch (err) {
 logger.error(`Migration Contact Error: ${contactEmail} | ${err.message}`);
}

return { stopProcess: false };
};

const runInitialLoad = async () => {


let hasNextPage = true;
let reachedTargetDate = false;

try {
logger.info(`Starting Migration. Target Date: ${config.migration.targetStartDate}`);

const savedState = stateService.getMigrationState();
let cursor = savedState.cursor;
let totalProcessed = savedState.total_processed || 0;

stateService.saveMigrationState({ status: 'RUNNING', error_message: null });
do {
    const response = await squarespaceService.getProfile(cursor);
    const safePayload = getSafeResponseData(response);
    const rawProfiles = safePayload.profiles || [];
    const pagination = safePayload.pagination || {};

    if (rawProfiles.length === 0) {
        if (pagination.hasNextPage) {
            cursor = pagination.nextPageCursor;
            stateService.saveMigrationState({ cursor: cursor, status: 'RUNNING' });
            continue; 
        } else {
            break;
        }
    }

    const hubspotContacts = rawProfiles.map(mapProfiles);
    
    hubspotContacts.sort((a, b) => b.contact.sqsp_created_on - a.contact.sqsp_created_on);

    for (const contact of hubspotContacts) {
        const result = await processSingleContact(contact);
        
        if (result.stopProcess) {
            reachedTargetDate = true;
            hasNextPage = false;
            break;
        }
        
        totalProcessed++;
        if (totalProcessed % 50 === 0) {
            logger.info(`Migration Progress: ${totalProcessed} contacts processed.`);
        }
    }

    if (!hasNextPage && reachedTargetDate) break;

    const lastContact = hubspotContacts[hubspotContacts.length - 1];

    if (pagination.hasNextPage) {
        cursor = pagination.nextPageCursor;
        stateService.saveMigrationState({
            cursor: cursor,
            last_processed_email: lastContact?.contact?.email,
            last_processed_date: lastContact?.contact?.sqsp_created_on,
            total_processed: totalProcessed,
            status: 'RUNNING'
        });
    } else {
        hasNextPage = false;
        cursor = null;
    }

} while (hasNextPage);

const completionMsg = reachedTargetDate 
    ? `Target Date Reached (${config.migration.targetStartDate})` 
    : "End of Stream Reached";

stateService.saveMigrationState({
    status: 'COMPLETED',
    cursor: null,
    error_message: null,
    message: completionMsg,
    total_processed: totalProcessed
});
logger.info(`Migration Completed: ${completionMsg}`);

} catch (error) { 
logger.error(`Migration Failed: ${error}`);
    stateService.saveMigrationState({
        status: 'ERROR',
        error_message: error.message
    });

}
};

module.exports = { runInitialLoad };
