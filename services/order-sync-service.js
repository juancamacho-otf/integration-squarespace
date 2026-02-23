const squarespaceService = require("./squarespace-service");
const hubspotService = require("./hubspot-service");
const stateService = require("./state-service");
const { mapOrder } = require("../mapping/order-mapping");
const { mapProfiles } = require("../mapping/contact-mapping");
const logger = require("./logger-service");

const CONFIG = {
    API_PAGE_DELAY_MS: 300,
    LOOKBACK_WINDOW_MS: 86400000 
};

let lastOrderSyncTimestamp = 0;
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

const initializeOrderCheckpoint = async () => {
    const state = stateService.getMigrationState();
    if (state && state.last_order_sync_timestamp > 0) {
        lastOrderSyncTimestamp = state.last_order_sync_timestamp;
    } else {
        lastOrderSyncTimestamp = Date.now() - CONFIG.LOOKBACK_WINDOW_MS;
    }
};

const processSingleOrder = async (order) => {
    const customerEmail = order.customerEmail;
    if (!customerEmail) return;

    try {
        let hubspotContactId = null;
        
        const searchResult = await hubspotService.searchContactsbyCustomId('email', [customerEmail], ['email']);
        
        if (searchResult.results && searchResult.results.length > 0) {
            hubspotContactId = searchResult.results[0].id;
        } else {
            const profileResponse = await squarespaceService.getProfileByEmail(customerEmail);
            const safeProfile = getSafeResponseData(profileResponse);
            const profileData = safeProfile.profiles ? safeProfile.profiles[0] : null;

            if (profileData) {
                const mappedProfile = mapProfiles(profileData);
                const contactData = mappedProfile.contact;
                const contactProperties = Object.keys(contactData).filter(k =>k !== 'transactionsSummary');

                const createResult = await hubspotService.createContacts(contactProperties, [contactData]);
                hubspotContactId = createResult?.results?.[0]?.id || createResult?.id;
            }
        }

        if (!hubspotContactId) return;

        const mappedOrderData = mapOrder(order);
        const dealData = mappedOrderData.deal;
        const orderData = mappedOrderData.order;
        const lineItemsData = mappedOrderData.line_items;

        const orderProperties = Object.keys(orderData).filter(k =>  k !== 'Name');
        const orderResult = await hubspotService.upsertOrder({
            searchProperty: 'hs_external_order_id',
            orderObject: orderData,
            hubspotProperties: orderProperties,
            associations: []
        });
        const hubspotOrderId = orderResult?.results?.[0]?.id || orderResult?.id;

        if (hubspotOrderId) {
            try {
                await hubspotService.createAssociationV4('contacts', hubspotContactId, 'orders', hubspotOrderId);
            } catch (err) {
                logger.error(`Failed to associate Contact ${hubspotContactId} with Order ${hubspotOrderId}: ${err.message}`);
            }
        }

        
        const dealProperties = Object.keys(dealData).filter(k =>  k !== 'payment_reference' && k !== 'hs_payment_processing_method');
        const dealResult = await hubspotService.upsertDeal({
            searchProperty: 'sqsp_order_id',
            dealObject: dealData,
            hubspotProperties: dealProperties,
            associations: []
        });
        
        const dealObj = dealResult?.results?.[0] || dealResult;
        const hubspotDealId = dealObj?.id;

        let isNewDeal = false;
        if (dealObj?.createdAt && dealObj?.updatedAt) {
            const createdTime = new Date(dealObj.createdAt).getTime();
            const updatedTime = new Date(dealObj.updatedAt).getTime();
            isNewDeal = Math.abs(updatedTime - createdTime) < 2000;
        } else if (dealObj?.createdAt && !dealObj?.updatedAt) {
            isNewDeal = true;
        }

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

            if (isNewDeal && lineItemsData && lineItemsData.length > 0) {
                const lineItemAssociations = [{ 
                    to: { id: hubspotDealId }, 
                    types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 20 }] 
                }];
                
                const lineItemProps = ["name", "price", "quantity", "hs_sku", "sqsp_lineitm_variant"];
                
                try {
                    await hubspotService.createLineItems({ 
                        propertiesArr: lineItemProps, 
                        lineItemArr: lineItemsData, 
                        associationsArr: lineItemAssociations 
                    });
                } catch (err) {
                    logger.error(`Failed to create line items for Deal ${hubspotDealId}: ${err.message}`);
                }
            }
        }

    } catch (error) {
        logger.error(`Order Sync Error (${order.orderNumber}): ${error.message}`);
    }
};

const runOrderSync = async () => {
    if (isProcessing) return;
    isProcessing = true;

    try {
        await initializeOrderCheckpoint();

        const startDateIso = new Date(lastOrderSyncTimestamp).toISOString();
        const endDateIso = new Date().toISOString();
        const cycleMaxTimestamp = new Date(endDateIso).getTime();

        let hasNextPage = true;
        let cursor = null;
        let orderCount = 0;

        while (hasNextPage) {
            const response = await squarespaceService.getOrdersByDateWindow(startDateIso, endDateIso, cursor);
            const safePayload = getSafeResponseData(response);
            const orders = safePayload.result || [];
            const pagination = safePayload.pagination || {};

            if (orders.length > 0) {
                for (const order of orders) {
                    await processSingleOrder(order);
                }
                orderCount += orders.length;
            }

            if (pagination.hasNextPage && pagination.nextPageCursor) {
                cursor = pagination.nextPageCursor;
                await sleep(CONFIG.API_PAGE_DELAY_MS);
            } else {
                hasNextPage = false;
            }
        }

        lastOrderSyncTimestamp = cycleMaxTimestamp;
        stateService.saveMigrationState({ last_order_sync_timestamp: lastOrderSyncTimestamp });

        if (orderCount > 0) {
            logger.info(`Order Sync Complete: ${orderCount} orders processed successfully.`);
        }

    } catch (error) {
        logger.error(`Order Sync Cycle Critical Error: ${error.message}`);
    } finally {
        isProcessing = false;
    }
};

module.exports = {
    runOrderSync
};