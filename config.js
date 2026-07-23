require("dotenv").config();

const config = {
    squarespace: {
        apiKey: process.env.SQUARESPACE_API_KEY,
    },

 hubspot: {
    accessToken: process.env.HUBSPOT_ACCESS_TOKEN,

    deals: {
        pipelineId: process.env.HUBSPOT_PIPELINE_ID,
        stageId: process.env.HUBSPOT_STAGE_WON
    },

    orders: {
        pipelineId: process.env.HUBSPOT_ORDER_PIPELINE_ID,
        stageId: process.env.HUBSPOT_ORDER_STAGE_ID
    }
},

    throttling: process.env.THROTTLING_SERVICE === "true",

    portConfig:{
        portNumn :{
        port: process.env.PORT || 3000
        }
    },
    migration: {
        targetStartDate: process.env.TARGET_START_DATE || "2025-12-01T00:00:00.000Z",
        apiPageDelayMs: parseInt(process.env.API_PAGE_DELAY_MS, 10) || 300,
        hubspotRateLimitDelay: parseInt(process.env.HUBSPOT_RATE_LIMIT_DELAY, 10) || 200
    }
};

module.exports = config;
