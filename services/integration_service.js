const squarespaceService = require("./squarespace-service");
const hubspotService = require("./hubspot-service"); 
const stateService = require("./state-service");
const { mapProfiles } = require("../mapping/contact-mapping");
const { mapOrder } = require("../mapping/order-mapping");
const { maptransactions } = require("../mapping/transactions-mapping");
const logger = require("./logger-service"); 

const CONFIG = {
    API_PAGE_DELAY_MS: 300            
};

let lastSyncTimestamp = 0; 
let isProcessing = false;

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
            if (matches.length > 0) {
                customerOrders.push(...matches);
            }

            if (pagination.hasNextPage && pagination.nextPageCursor) {
                orderCursor = pagination.nextPageCursor;
                await sleep(CONFIG.API_PAGE_DELAY_MS);
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

            const orderProperties = Object.keys(orderData).filter(k => k !== 'Name');
            const orderResult = await hubspotService.upsertOrder({
                searchProperty: 'hs_external_order_id',
                orderObject: orderData,
                hubspotProperties: orderProperties,
                associations: []
            });
            
            const orderObj = orderResult?.results?.[0] || orderResult;
            const hubspotOrderId = orderObj?.id;

    

            if (hubspotOrderId) {
                try {
                    await hubspotService.createAssociationV4('contacts', hubspotContactId, 'orders', hubspotOrderId);
                } catch (err) {
                    logger.error(`Failed to associate Contact ${hubspotContactId} with Order ${hubspotOrderId}: ${err.message}`);
                }
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
                try {
                    await hubspotService.createAssociationV4('contacts', hubspotContactId, 'deals', hubspotDealId);
                } catch (err) {
                    logger.error(`Failed to associate Contact ${hubspotContactId} with Deal ${hubspotDealId}: ${err.message}`);
                }
                
                if (hubspotOrderId) {
                    try {
                        await hubspotService.createAssociationV4('orders', hubspotOrderId, 'deals', hubspotDealId);
                    } catch (err) {
                        logger.error(`Failed to associate Order ${hubspotOrderId} with Deal ${hubspotDealId}: ${err.message}`);
                    }
                }
            }

            if (lineItemsData && lineItemsData.length > 0 && hubspotOrderId) {
                try {
                    
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
            logger.error(`Order Sync Error: ${err.message}`);
        }
    }
};

const processContactsBatch = async (hubspotContacts) => {
    const newContacts = hubspotContacts.filter(c => {
        if (!c.contact) return false;
        const createdOn = c.contact.sqsp_created_on;
        const lastOrderDate = c.contact.transactionsSummary?.lastOrderSubmittedOn 
            ? new Date(c.contact.transactionsSummary.lastOrderSubmittedOn).getTime() 
            : 0;
        return createdOn > lastSyncTimestamp || lastOrderDate > lastSyncTimestamp;
    });

    if (newContacts.length === 0) return; 

    newContacts.sort((a, b) => {
        const dateA = Math.max(a.contact.sqsp_created_on, new Date(a.contact.transactionsSummary?.lastOrderSubmittedOn || 0).getTime());
        const dateB = Math.max(b.contact.sqsp_created_on, new Date(b.contact.transactionsSummary?.lastOrderSubmittedOn || 0).getTime());
        return dateA - dateB;
    });

    let processedCount = 0;
    let batchMaxTimestamp = lastSyncTimestamp;

    for (const item of newContacts) {
        const contactEmail = item.contact?.email?.toLowerCase()?.trim();
        if (!contactEmail) continue;

        const createdOn = item.contact?.sqsp_created_on;
        const lastOrderDate = item.contact.transactionsSummary?.lastOrderSubmittedOn 
            ? new Date(item.contact.transactionsSummary.lastOrderSubmittedOn).getTime() 
            : 0;
        const activityDate = Math.max(createdOn, lastOrderDate);

        const isCustomer = item.contact.iscustomer === true || String(item.contact.iscustomer).toLowerCase() === 'true';
        const transactionsSummary = item.contact.transactionsSummary;

        if (!isCustomer) {
            if (activityDate > batchMaxTimestamp) batchMaxTimestamp = activityDate;
            continue;
        }

        try {
            const contactData = item.contact;
            const contactDataDefault = item.defaultContactAddress;
            const contactProperties = Object.keys(contactData).filter(key => key !== 'transactionsSummary');
            
            const contactResult = await hubspotService.upsertContact({
                searchProperty: 'email',
                contactObject: contactData,
                defaultContactAddress: contactDataDefault,
                hubspotProperties: contactProperties
            });
            
            const hubspotContactId = contactResult?.results?.[0]?.id || contactResult?.id;

            if (!hubspotContactId) {
                continue; 
            }

            await processCustomerOrders(contactEmail, hubspotContactId, transactionsSummary);
            
            if (activityDate > batchMaxTimestamp) {
                batchMaxTimestamp = activityDate;
            }
            
            processedCount++;

        } catch (error) {
            logger.error(`Contact Logic Error: ${contactEmail} | ${error.message}`);

        }
    }
    
    if (batchMaxTimestamp > lastSyncTimestamp) {
        lastSyncTimestamp = batchMaxTimestamp;
        stateService.saveMigrationState({ last_processed_timestamp: lastSyncTimestamp });
    }

    if (processedCount > 0) {
        logger.info(`Processed ${processedCount} profiles.`);
    }
};

const initializeCheckpoint = async () => {
    const state = stateService.getMigrationState();
    if (state && state.last_processed_timestamp > 0) {
        lastSyncTimestamp = state.last_processed_timestamp;
        return;
    }

    if (lastSyncTimestamp > 0) return;

    try {
        const response = await squarespaceService.getProfile(null);
        stateService.saveMigrationState({ last_processed_timestamp: lastSyncTimestamp });
    } catch (error) {
        lastSyncTimestamp = Date.now() - (24 * 60 * 60 * 1000);
    }
};

const runSyncCycle = async () => {
    if (isProcessing) return;
    isProcessing = true;

    try {
        await initializeCheckpoint();
        
        let hasNextPage = true;
        let cursor = null;

        while (hasNextPage) {
            const response = await squarespaceService.getProfile(cursor); 
            const safePayload = getSafeResponseData(response);
            const rawProfiles = safePayload.profiles || [];
            const pagination = safePayload.pagination || {};
            
            if (rawProfiles.length > 0) {
                await processContactsBatch(rawProfiles.map(mapProfiles));
            }

            if (pagination.hasNextPage && pagination.nextPageCursor) {
                cursor = pagination.nextPageCursor;
                await sleep(CONFIG.API_PAGE_DELAY_MS);
            } else {
                hasNextPage = false;
            }
        }
    } catch (error) {
        logger.error(`Cycle Error: ${error.message}`);
    } finally {
        isProcessing = false;
    }
};

module.exports = { 
    initializeCheckpoint,
    runSyncCycle
};
