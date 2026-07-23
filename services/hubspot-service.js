require("dotenv").config();
hubspotConnection = require("../connections/hubspot-connection");
const hubspotClient = hubspotConnection.hubspotClient();
const requestService = require("./request_service");
const minTimeBetweenRequests = 500;

const getObjectPage = async ({ limit, after, objectType, properties }) => {
  const apiResponse =
    await requestService.makeHubspotRequestWithExponentialRetries({
      hubspotClient,
      requestFunctionRoute: ["crm", "objects", "basicApi", "getPage"],
      requestFunctionParam: [objectType, limit, after, properties],
    });
  // console.log(apiResponse);
  return apiResponse;
};

const readAssociations = async ({ fromObjectType, toObjectType, inputs }) => {
  const BatchInputPublicObjectId = { inputs };

  const apiResponse =
    await requestService.makeHubspotRequestWithExponentialRetries({
      hubspotClient,
      requestFunctionRoute: ["crm", "associations", "batchApi", "read"],
      requestFunctionParam: [
        fromObjectType,
        toObjectType,
        BatchInputPublicObjectId,
      ],
    });
  // console.log(apiResponse);
  return apiResponse;
};

const deleteLineItems = async ({ dealId }) => {
  const inputs = [
    {
      id: dealId,
    },
  ];

  const asociationResponse =
    await requestService.makeHubspotRequestWithExponentialRetries({
      hubspotClient,
      requestFunctionRoute: ["crm", "associations", "batchApi", "read"],
      requestFunctionParam: ["deals", "line_items", { inputs }],
    });

  if (!asociationResponse.results) return false;

  const lineItemIdArr =
    (asociationResponse.results &&
      asociationResponse.results[0] &&
      asociationResponse.results[0].to.map((result) => ({
        id: result.id,
      }))) ||
    [];
  // console.log({ lineItemIdArr });
  console.log("lineItemIdArr: ", lineItemIdArr.length);

  if (lineItemIdArr.length == 0) return true;

  await requestService.makeHubspotRequestWithExponentialRetries({
    hubspotClient,
    requestFunctionRoute: ["crm", "lineItems", "batchApi", "archive"],
    requestFunctionParam: [{ inputs: lineItemIdArr }],
  });

  return true;
};
const deleteOrderLineItems = async ({ orderId }) => {
  const associationResponse =
    await requestService.makeHubspotRequestWithExponentialRetries({
      hubspotClient,
      requestFunctionRoute: ["crm", "associations", "batchApi", "read"],
      requestFunctionParam: [
        "orders",
        "line_items",
        {
          inputs: [{ id: orderId }],
        },
      ],
    });

  const lineItemIdArr =
    associationResponse.results?.[0]?.to?.map(({ id }) => ({ id })) || [];

  console.log(`Order ${orderId} has ${lineItemIdArr.length} line items.`);

  if (lineItemIdArr.length === 0) {
    return true;
  }

  await requestService.makeHubspotRequestWithExponentialRetries({
    hubspotClient,
    requestFunctionRoute: ["crm", "lineItems", "batchApi", "archive"],
    requestFunctionParam: [
      {
        inputs: lineItemIdArr,
      },
    ],
  });

  return true;
};
const delayForRateLimit = async () => {
  await new Promise((resolve) => setTimeout(resolve, minTimeBetweenRequests));
};

const updateContacts = async (idProperty, propertiesArr, contactsArr) => {
  let inputs = [];
  contactsArr.forEach((contact) => {
    const input = {};
    if (idProperty) {
      input["idProperty"] = idProperty;
      input["id"] = contact[idProperty].toLowerCase();
    } else {
      input["id"] = contact["hsId"];
    }

    input["properties"] = {};
    propertiesArr.forEach(
      (property) => (input["properties"][property] = contact[property])
    );
    inputs.push(input);
  });

  const BatchInputSimplePublicObjectBatchInput = {
    inputs,
  };

  const apiResponse =
    await requestService.makeHubspotRequestWithExponentialRetries({
      hubspotClient,
      requestFunctionRoute: ["crm", "contacts", "batchApi", "update"],
      requestFunctionParam: [BatchInputSimplePublicObjectBatchInput],
    });

  // const apiResponse = await hubspotClient.crm.contacts.batchApi.update(
  //   BatchInputSimplePublicObjectBatchInput
  // );
  return apiResponse;
};
const updateCompanies = async (idProperty, propertiesArr, companiesArr) => {
  let inputs = [];
  companiesArr.forEach((company) => {
    const input = {};
    if (idProperty) {
      input["idProperty"] = idProperty;
      input["id"] = company[idProperty].toLowerCase();
    } else {
      input["id"] = company["hsId"];
    }

    input["properties"] = {};
    propertiesArr.forEach(
      (property) => (input["properties"][property] = company[property])
    );
    inputs.push(input);
  });

  const BatchInputSimplePublicObjectBatchInput = {
    inputs,
  };

  const apiResponse =
    await requestService.makeHubspotRequestWithExponentialRetries({
      hubspotClient,
      requestFunctionRoute: ["crm", "companies", "batchApi", "update"],
      requestFunctionParam: [BatchInputSimplePublicObjectBatchInput],
    });
  // const apiResponse = await hubspotClient.crm.companies.batchApi.update(
  //   BatchInputSimplePublicObjectBatchInput
  // );
  return apiResponse;
};
const updateDeals = async (idProperty, propertiesArr, contactsArr) => {
  let inputs = [];
  contactsArr.forEach((contact) => {
    const input = {};
    if (idProperty) {
      input["idProperty"] = idProperty;
      input["id"] = contact[idProperty].toLowerCase();
    } else {
      input["id"] = contact["hsId"];
    }

    input["properties"] = {};
    propertiesArr.forEach(
      (property) => (input["properties"][property] = contact[property])
    );
    inputs.push(input);
  });

  const BatchInputSimplePublicObjectBatchInput = {
    inputs,
  };

  const apiResponse =
    await requestService.makeHubspotRequestWithExponentialRetries({
      hubspotClient,
      requestFunctionRoute: ["crm", "deals", "batchApi", "update"],
      requestFunctionParam: [BatchInputSimplePublicObjectBatchInput],
    });
  // const apiResponse = await hubspotClient.crm.companies.batchApi.update(
  //   BatchInputSimplePublicObjectBatchInput
  // );
  return apiResponse;
};
const updateCustomObjects = async (
  idProperty,
  propertiesArr,
  customObjectsArr,
  customObjectType
) => {
  let inputs = [];
  customObjectsArr.forEach((customObj) => {
    const input = {};
    if (idProperty) {
      input["idProperty"] = idProperty;
      input["id"] = customObj[idProperty].toLowerCase();
    } else {
      input["id"] = customObj["hsId"];
    }
    input["properties"] = {};
    propertiesArr.forEach(
      (property) => (input["properties"][property] = customObj[property])
    );
    inputs.push(input);
  });

  const batchLimitSize = 100;
  let updateCustomObjectsResponse = { results: [] };
  for (let i = 0; i < inputs.length; i += batchLimitSize) {
    const BatchInputSimplePublicObjectBatchInput = {
      inputs: inputs.slice(i, i + batchLimitSize),
    };

    const apiResponse =
      await requestService.makeHubspotRequestWithExponentialRetries({
        hubspotClient,
        requestFunctionRoute: ["crm", "objects", "batchApi", "update"],
        requestFunctionParam: [
          customObjectType,
          BatchInputSimplePublicObjectBatchInput,
        ],
      });
    // const apiResponse = await hubspotClient.crm.objects.batchApi.update(
    //   customObjectType,
    //   BatchInputSimplePublicObjectBatchInput
    // );

    updateCustomObjectsResponse.results =
      updateCustomObjectsResponse.results.concat(apiResponse.results);
  }
  return updateCustomObjectsResponse;
};

const createContacts = async (propertiesArr, contactsArr) => {
  let inputs = [];
  contactsArr.forEach((contact) => {
    const input = {};

    input["properties"] = {};
    propertiesArr.forEach(
      (property) => (input["properties"][property] = contact[property])
    );
    inputs.push(input);
  });

  const BatchInputSimplePublicObjectBatchInput = {
    inputs,
  };

  const apiResponse =
    await requestService.makeHubspotRequestWithExponentialRetries({
      hubspotClient,
      requestFunctionRoute: ["crm", "contacts", "batchApi", "create"],
      requestFunctionParam: [BatchInputSimplePublicObjectBatchInput],
    });
  // const apiResponse = await hubspotClient.crm.contacts.batchApi.create(
  //   BatchInputSimplePublicObjectBatchInput
  // );
  return apiResponse;
};
const createCompanies = async (propertiesArr, contactsArr) => {
  let inputs = [];
  contactsArr.forEach((contact) => {
    const input = {};

    input["properties"] = {};
    propertiesArr.forEach(
      (property) => (input["properties"][property] = contact[property])
    );
    inputs.push(input);
  });

  const BatchInputSimplePublicObjectBatchInput = {
    inputs,
  };

  const apiResponse =
    await requestService.makeHubspotRequestWithExponentialRetries({
      hubspotClient,
      requestFunctionRoute: ["crm", "companies", "batchApi", "create"],
      requestFunctionParam: [BatchInputSimplePublicObjectBatchInput],
    });
  // const apiResponse = await hubspotClient.crm.companies.batchApi.create(
  //   BatchInputSimplePublicObjectBatchInput
  // );
  return apiResponse;
};
const createCustomObject = async (
  customObjectType,
  propertiesArr,
  objectsArr
) => {
  let inputs = [];
  objectsArr.forEach((object) => {
    const input = {};

    input["properties"] = {};
    propertiesArr.forEach(
      (property) => (input["properties"][property] = object[property])
    );
    inputs.push(input);
  });

  const BatchInputSimplePublicObjectBatchInput = {
    inputs,
  };

  const apiResponse =
    await requestService.makeHubspotRequestWithExponentialRetries({
      hubspotClient,
      requestFunctionRoute: ["crm", "objects", "batchApi", "create"],
      requestFunctionParam: [
        customObjectType,
        BatchInputSimplePublicObjectBatchInput,
      ],
    });
  // const apiResponse = await hubspotClient.crm.objects.batchApi.create(
  //   customObjectType,
  //   BatchInputSimplePublicObjectBatchInput
  // );
  return apiResponse;
};
const createDeals = async (propertiesArr, dealsArr, associationsArr) => {
  let inputs = [];
  dealsArr.forEach((deal) => {
    const input = {};

    input["properties"] = {};
    propertiesArr.forEach(
      (property) => (input["properties"][property] = deal[property])
    );
    input["associations"] = associationsArr;
    inputs.push(input);
  });

  const BatchInputSimplePublicObjectBatchInput = {
    inputs,
  };
  // console.log("Here is the payload for deal creation: ", inputs);

  const apiResponse =
    await requestService.makeHubspotRequestWithExponentialRetries({
      hubspotClient,
      requestFunctionRoute: ["crm", "deals", "batchApi", "create"],
      requestFunctionParam: [BatchInputSimplePublicObjectBatchInput],
    });
  // const apiResponse = await hubspotClient.crm.deals.batchApi.create(
  //   BatchInputSimplePublicObjectBatchInput
  // );
  return apiResponse;
};
const createLineItems = async ({
  propertiesArr,
  lineItemArr,
  associationsArr,
}) => {
  let inputs = [];
  lineItemArr
    .filter((lineItem) => lineItem["price"] > 0)
    .forEach((lineItem) => {
      const input = {};

      input["properties"] = {};
      propertiesArr.forEach(
        (property) => (input["properties"][property] = lineItem[property])
      );
      input["associations"] = associationsArr;
      inputs.push(input);
    });

  const BatchInputSimplePublicObjectBatchInput = {
    inputs,
  };
  // console.log("Here is the payload for lineItem creation: ", inputs);
  const apiResponse =
    await requestService.makeHubspotRequestWithExponentialRetries({
      hubspotClient,
      requestFunctionRoute: ["crm", "lineItems", "batchApi", "create"],
      requestFunctionParam: [BatchInputSimplePublicObjectBatchInput],
    });
  // const apiResponse = await hubspotClient.crm.deals.batchApi.create(
  //   BatchInputSimplePublicObjectBatchInput
  // );
  return apiResponse;
};

const searchContactsbyCustomId = async (
  idProperty,
  idArr,
  returnPropertyArr
) => {
  await delayForRateLimit();

  try {
    let searchResponse = { results: [] };
    const batchLimitSize = 5;
    for (let i = 0; i < idArr.length; i += batchLimitSize) {
      const chunk = idArr.slice(i, i + batchLimitSize);
      const searchCriteria = {
        filterGroups: chunk.map((id) => ({
          filters: [
            {
              propertyName: idProperty,
              operator: "EQ",
              value: id,
            },
          ],
        })),
        properties: returnPropertyArr,
      };

      const searchResponseTemp =
        await requestService.makeHubspotRequestWithExponentialRetries({
          hubspotClient,
          requestFunctionRoute: ["crm", "contacts", "searchApi", "doSearch"],
          requestFunctionParam: [searchCriteria],
        });
      // const searchResponseTemp =
      //   await hubspotClient.crm.contacts.searchApi.doSearch(searchCriteria);

      searchResponse.results = searchResponse.results.concat(
        searchResponseTemp.results
      );
    }
    //console.dir(searchResponse, { depth: null });
    return searchResponse;
  } catch (err) {
    console.log(`error on searchContactsbyCustomId: ${err}`);
    return { error: err };
  }
};
const searchCompaniesbyCustomId = async (
  idProperty,
  idArr,
  returnPropertyArr
) => {
  await delayForRateLimit();

  try {
    let searchResponse = { results: [] };
    const batchLimitSize = 5;
    for (let i = 0; i < idArr.length; i += batchLimitSize) {
      const chunk = idArr.slice(i, i + batchLimitSize);
      const searchCriteria = {
        filterGroups: chunk.map((id) => ({
          filters: [
            {
              propertyName: idProperty,
              operator: "EQ",
              value: id,
            },
          ],
        })),
        properties: returnPropertyArr,
      };

      const searchResponseTemp =
        await requestService.makeHubspotRequestWithExponentialRetries({
          hubspotClient,
          requestFunctionRoute: ["crm", "companies", "searchApi", "doSearch"],
          requestFunctionParam: [searchCriteria],
        });
      // const searchResponseTemp =
      //   await hubspotClient.crm.companies.searchApi.doSearch(searchCriteria);

      // console.log("searchResponseTemp: ", searchResponseTemp);
      searchResponse.results = searchResponse.results.concat(
        searchResponseTemp.results
      );
    }
    // console.dir(searchResponse, { depth: null });
    return searchResponse;
  } catch (err) {
    console.log(`error on searchCompaniesbyCustomId: ${err}`);
    if (err.code == 429) return;
    return { error: err };
  }
};
const searchDealsbyCustomId = async (idProperty, idArr, returnPropertyArr) => {
  await delayForRateLimit();

  try {
    let searchResponse = { results: [] };
    const batchLimitSize = 5;
    for (let i = 0; i < idArr.length; i += batchLimitSize) {
      const chunk = idArr.slice(i, i + batchLimitSize);
      const searchCriteria = {
        filterGroups: chunk.map((id) => ({
          filters: [
            {
              propertyName: idProperty,
              operator: "EQ",
              value: id,
            },
          ],
        })),
        properties: returnPropertyArr,
      };

      const searchResponseTemp =
        await requestService.makeHubspotRequestWithExponentialRetries({
          hubspotClient,
          requestFunctionRoute: ["crm", "deals", "searchApi", "doSearch"],
          requestFunctionParam: [searchCriteria],
        });
      // const searchResponseTemp =
      //   await hubspotClient.crm.deals.searchApi.doSearch(searchCriteria);

      // console.log("searchResponseTemp: ", searchResponseTemp);
      searchResponse.results = searchResponse.results.concat(
        searchResponseTemp.results
      );
    }
    // console.dir(searchResponse, { depth: null });
    return searchResponse;
  } catch (err) {
    console.log(`error on searchDealsbyCustomId: ${err}`);
    if (err.code == 429) return;
    return { error: err };
  }
};

const searchCustomObjectsbyCustomId = async (
  idProperty,
  idArr,
  customObjectName,
  returnPropertyArr
) => {
  await delayForRateLimit();

  try {
    let searchResponse = { results: [] };
    const batchLimitSize = 5;
    for (let i = 0; i < idArr.length; i += batchLimitSize) {
      const chunk = idArr.slice(i, i + batchLimitSize);
      const searchCriteria = {
        filterGroups: chunk.map((id) => ({
          filters: [
            {
              propertyName: idProperty,
              operator: "EQ",
              value: id,
            },
          ],
        })),
        properties: returnPropertyArr,
      };

      const searchResponseTemp =
        await requestService.makeHubspotRequestWithExponentialRetries({
          hubspotClient,
          requestFunctionRoute: ["crm", "objects", "searchApi", "doSearch"],
          requestFunctionParam: [customObjectName, searchCriteria],
        });
      // const searchResponseTemp =
      //   await hubspotClient.crm.objects.searchApi.doSearch(
      //     customObjectName,
      //     searchCriteria
      //   );

      searchResponse.results = searchResponse.results.concat(
        searchResponseTemp.results
      );
    }
    // console.dir(searchResponse, { depth: null });
    return searchResponse;
  } catch (err) {
    console.log(`error on searchCustomObjectsbyCustomId: ${err}`);
    return { error: err };
  }
};

const upsertContact = async ({
  searchProperty,
  contactObject,
  defaultContactAddress,
  hubspotProperties,
  secondarySearchProperty,
}) => {
  const searchResult = await searchContactsbyCustomId(
    searchProperty,
    [contactObject[searchProperty]],
    hubspotProperties
  );

  const secondarySearchResult =
    secondarySearchProperty &&
    (await searchContactsbyCustomId(
      secondarySearchProperty,
      [contactObject[secondarySearchProperty]],
      hubspotProperties
    ));

  const contactAlreadyExists =
    (searchResult.results &&
      searchResult.results[0] &&
      searchResult.results[0].id) ||
    (secondarySearchResult &&
      secondarySearchResult.results &&
      secondarySearchResult.results[0] &&
      secondarySearchResult.results[0].id);

  if (contactAlreadyExists) {
    contactObject["hsId"] =
      (searchResult.results &&
        searchResult.results[0] &&
        searchResult.results[0].id) ||
      (secondarySearchResult.results[0] && secondarySearchResult.results[0].id);

    const updateResult = await updateContacts(null, hubspotProperties, [
      contactObject,
    ]);
    console.log("this is the update result for contact");
    return updateResult;
  } else {
    const createProperties = Object.keys(defaultContactAddress)
    .filter(key => key !== "transactionsSummary");

    const createResult = await createContacts(createProperties, [
      defaultContactAddress,

    ]);
    console.log("this is the create result for contact");
    return createResult;
  }
};
const upsertCompany = async ({
  searchProperty,
  companyObject,
  hubspotProperties,
}) => {
  const searchResult = await searchCompaniesbyCustomId(
    searchProperty,
    [companyObject[searchProperty]],
    hubspotProperties
  );

  const companyAlreadyExists =
    searchResult.results &&
    searchResult.results[0] &&
    searchResult.results[0].id;

  if (companyAlreadyExists) {
    companyObject["hsId"] = searchResult.results[0].id;

    const updateResult = await updateCompanies(null, hubspotProperties, [
      companyObject,
    ]);
    console.log("this is the update result for company");
    return updateResult;
  } else {
    const createResult = await createCompanies(hubspotProperties, [
      companyObject,
    ]);
    console.log("this is the create result for company");
    return createResult;
  }
};
const upsertDeal = async ({
  searchProperty,
  dealObject,
  hubspotProperties,
  associations,
}) => {
  const searchResult = await searchDealsbyCustomId(
    searchProperty,
    [dealObject[searchProperty]],
    hubspotProperties
  );

  const dealAlreadyExists =
    searchResult.results &&
    searchResult.results[0] &&
    searchResult.results[0].id;

  if (dealAlreadyExists) {
    dealObject["hsId"] = searchResult.results[0].id;
    const updateResult = await updateDeals(null, hubspotProperties, [
      dealObject,
    ]);
    console.log("this is the update result for deal");
    console.log(dealObject.dealstage);
    return updateResult;
    // return;
  } else {
    const createResult = await createDeals(
      hubspotProperties,
      [dealObject],
      associations
    );
    console.log("this is the create result for deal");
    return createResult;
  }
};
const upsertCustomObject = async ({
  customObjectType,
  searchProperty,
  customObject,
  hubspotProperties,
}) => {
  const searchResult = await searchCustomObjectsbyCustomId(
    searchProperty,
    [customObject[searchProperty]],
    customObjectType,
    hubspotProperties
  );

  const objectAlreadyExists =
    searchResult.results &&
    searchResult.results[0] &&
    searchResult.results[0].id;

  if (objectAlreadyExists) {
    customObject["hsId"] = searchResult.results[0].id;

    const updateResult = await updateCustomObjects(
      null,
      hubspotProperties,
      [customObject],
      customObjectType
    );
    console.log(`this is the update result for ${customObjectType}`);
    return updateResult;
  } else {
    const createResult = await createCustomObject(
      customObjectType,
      hubspotProperties,
      [customObject]
    );
    console.log(`this is the create result for ${customObjectType}`);
    return createResult;
  }
};
const updateLead = async ({ leadObj, leadId }) => {
  const hubspotAccessToken = hubspotConnection.accessToken;

  await requestService.makeRequestWithExponentialRetries({
    url: `https://api.hubapi.com/crm/v3/objects/leads/${leadId}`,
    type: "PATCH",
    data: leadObj,
    headers: { Authorization: `Bearer ${hubspotAccessToken}` },
  });
};
const associateLeadToDeal = async ({ dealId, leadId }) => {
  const hubspotAccessToken = hubspotConnection.accessToken;

  await requestService.makeRequestWithExponentialRetries({
    url: `https://api.hubapi.com/crm/v3/objects/leads/${leadId}/associations/deals/${dealId}/582`,
    type: "PUT",
    headers: { Authorization: `Bearer ${hubspotAccessToken}` },
    data: {},
  });
};

const createDefaultAssociationBatch = async ({
  fromObjectType,
  toObjectType,
  inputArr,
}) => {
  const batchLimitSize = 100;
  let response = {};

  await delayForRateLimit();

  for (let i = 0; i < inputArr.length; i += batchLimitSize) {
    const chunk = inputArr.slice(i, i + batchLimitSize);

    response = await requestService.makeHubspotRequestWithExponentialRetries({
      hubspotClient,
      requestFunctionRoute: ["crm", "associations", "batchApi", "create"],
      requestFunctionParam: [
        fromObjectType,
        toObjectType,
        {
          inputs: chunk,
        },
      ],
    });
  }
  return response;
};

const retrieveObjectsbyIds = async ({
  recordIdArr,
  objectType,
  properties,
}) => {
  const BatchReadInputSimplePublicObjectId = {
    inputs: recordIdArr.map((id) => ({ id })),
    properties,
  };
  const response =
    await requestService.makeHubspotRequestWithExponentialRetries({
      hubspotClient,
      requestFunctionRoute: ["crm", "objects", "batchApi", "read"],
      requestFunctionParam: [objectType, BatchReadInputSimplePublicObjectId],
    });
  // console.dir(response, { depth: null });

  return response;
};

const deleteObject = async ({ objectId, objectType }) => {
  await requestService.makeHubspotRequestWithExponentialRetries({
    hubspotClient,
    requestFunctionRoute: ["crm", objectType, "basicApi", "archive"],
    requestFunctionParam: [objectId],
  });

  return true;
};

async function getDealsByStage({ dealstage, properties }) {
  const deals = [];
  let after = undefined;

  try {
    do {
      const searchCriteria = {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "dealstage",
                operator: "EQ",
                value: dealstage,
              },
            ],
          },
        ],
        limit: 100,
        properties,
        after,
      };

      const searchResponseTemp =
        await requestService.makeHubspotRequestWithExponentialRetries({
          hubspotClient,
          requestFunctionRoute: ["crm", "deals", "searchApi", "doSearch"],
          requestFunctionParam: [searchCriteria],
        });
      const pageResults = searchResponseTemp.results || [];
      deals.push(...pageResults);
      after = searchResponseTemp.paging?.next?.after;
    } while (after);

    console.log(
      `${deals.length} deals were found in stage "${dealstage}".`
    );
    return deals;
  } catch (error) {
    console.error("Error getting deals by stage:", error.message);
    if (error.response?.body) console.error(error.response.body);
    throw error;
  }
}

const createOrders = async (propertiesArr, ordersArr, associationsArr) => {
  let inputs = [];
  ordersArr.forEach((order) => {
    const input = {};
    input["properties"] = {};
    propertiesArr.forEach((prop) => (input["properties"][prop] = order[prop]));
    
    
    if (associationsArr) {
        input["associations"] = associationsArr;
    }
    inputs.push(input);
  });

  const BatchInputSimplePublicObjectBatchInput = { inputs };
  

  return await requestService.makeHubspotRequestWithExponentialRetries({
      hubspotClient,
      requestFunctionRoute: ["crm", "objects", "batchApi", "create"],
      requestFunctionParam: ["orders", BatchInputSimplePublicObjectBatchInput],
    });
};


const upsertOrder = async ({ searchProperty, orderObject, hubspotProperties, associations }) => {
  // 1. Buscar si existe
  const searchResult = await searchCustomObjectsbyCustomId(
    searchProperty,
    [orderObject[searchProperty]],
    "orders", 
    hubspotProperties
  );

  const existingId = searchResult.results?.[0]?.id;

  if (existingId) {
   
    orderObject["hsId"] = existingId;
   
    return await updateCustomObjects(null, hubspotProperties, [orderObject], "orders");
  } else {
    
    console.log("Creating a new Order...");
    return await createOrders(hubspotProperties, [orderObject], associations);
  }
};
const createAssociationV4 = async (fromType, fromId, toType, toId) => {
  await delayForRateLimit();
  try {
    const response = await requestService.makeHubspotRequestWithExponentialRetries({
      hubspotClient, // Usa la variable interna del módulo, sin importarla fuera
      requestFunctionRoute: ['crm', 'associations', 'v4', 'basicApi', 'createDefault'],
      requestFunctionParam: [fromType, fromId, toType, toId]
    });
    return response;
  } catch (e) {
    // Si el error es "ya existe", lo ignoramos para no ensuciar el log
    if (e.message && e.message.includes('already exists')) {
      return { status: 'exists' };
    }
    // Si es otro error, lo lanzamos para que main.js lo vea
    console.log(`Error en createAssociationV4 (${fromType}->${toType}): ${e.message}`);
    throw e;
  }
};



const getAllUsers = async () => {
  const users = [];
  let after = undefined;

  try {
    do {
      // const response = await hubspotClient.crm.owners.ownersApi.getPage(
      //   undefined,
      //   after,
      //   100
      // );
      // const pageResults = response.body.results || [];
      // users.push(...pageResults);

      // after = response.body.paging?.next?.after;

      const searchResponseTemp =
        await requestService.makeHubspotRequestWithExponentialRetries({
          hubspotClient,
          requestFunctionRoute: ["crm", "owners", "ownersApi", "getPage"],
          requestFunctionParam: [undefined, after, 100],
        });
      const pageResults = searchResponseTemp.results || [];
      users.push(...pageResults);
      after = searchResponseTemp.paging?.next?.after;
    } while (after);

    console.log(`Se encontraron ${users.length} usuarios.`);
    return users;
  } catch (error) {
    console.error("Error al obtener los usuarios:", error.message);
    if (error.response?.body) console.error(error.response.body);
    throw error;
  }
};

module.exports = {
  searchContactsbyCustomId,
  searchCompaniesbyCustomId,
  searchCustomObjectsbyCustomId,
  updateContacts,
  updateCompanies,
  updateCustomObjects,
  createContacts,
  createCompanies,
  createCustomObject,
  upsertContact,
  upsertCompany,
  upsertCustomObject,
  delayForRateLimit,
  createDefaultAssociationBatch,
  upsertDeal,
  getObjectPage,
  readAssociations,
  retrieveObjectsbyIds,
  searchDealsbyCustomId,
  createLineItems,
  deleteLineItems,
  deleteOrderLineItems,
  deleteObject,
  getDealsByStage,
  getAllUsers,
  updateLead,
  associateLeadToDeal,
  upsertOrder,
  createOrders,
  createAssociationV4,
};
