import { mostRelevantKMeansCluster } from "./tool-parser";

describe("mostRelevantKMeansCluster", () => {
  it("should return the most relevant k-means cluster", () => {
    const tools = [
      {
        embeddingId: "venue_validateMemberCSV",
        similarity: 0.7102827858523657,
        serviceName: "venue",
        functionName: "validateMemberCSV",
        description: "Function for validating member CSV upload",
        schema:
          '{"type":"object","properties":{"data":{"type":"array","items":{"type":"string"},"minItems":2,"description":"CSV data as a string array"}},"required":["data"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "venue_bulkUploadMembers",
        similarity: 0.6481761863085908,
        serviceName: "venue",
        functionName: "bulkUploadMembers",
        description:
          "Function for bulk uploading members. Only call with 1000 records at a time.",
        schema:
          '{"type":"object","properties":{"data":{"type":"object","properties":{"members":{"type":"array","items":{"type":"object","properties":{"email":{"type":"string"},"expiration":{"type":"string"},"firstName":{"type":"string"},"lastName":{"type":"string"},"memberId":{"type":"string"},"mobile":{"type":"string"},"tier":{"type":"string"}},"required":["email","expiration","firstName","lastName","memberId","mobile","tier"],"additionalProperties":false}},"organizationId":{"type":"string"}},"required":["members","organizationId"],"additionalProperties":false}},"required":["data"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "venue_getTabOrdersForUser",
        similarity: 0.5688057263962708,
        serviceName: "venue",
        functionName: "getTabOrdersForUser",
        description:
          "Retrieve and group all orders for a user by socialTabId. This function will recursively fetch all orders, up to a maximum of 1000 orders (10 calls with 100 limit each).",
        schema: `{"type":"object","properties":{"venueId":{"type":"string"},"userIdentifier":{"type":"string","description":"User's email or phone number. Must be a valid email or phone number with a country code. Example: +61412345678 for an Australian phone number."},"venueSlug":{"type":"string","description":"The slug of the venue. Example: shawntest. If you don't have this, use venueInfo to get it."},"skip":{"type":"number","default":0},"limit":{"type":"number","default":100},"recursionCount":{"type":"number","default":0}},"required":["venueId","userIdentifier","venueSlug"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}`,
      },
      {
        embeddingId: "venue_userByMobileOrEmail",
        similarity: 0.5488022083860045,
        serviceName: "venue",
        functionName: "userByMobileOrEmail",
        description:
          "Get a user by their mobile number or email address. Returns userId, name etc",
        schema:
          '{"type":"object","properties":{"mobile":{"type":"string","description":"Mobile number in E.164 format","default":""},"email":{"type":"string","default":""}},"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "datadog_getUserOrders",
        similarity: 0.5397164120612212,
        serviceName: "datadog",
        functionName: "getUserOrders",
        description:
          "Given a full name, mobile number, or email address, returns a list of orders made by that user",
        schema: `{"type":"object","properties":{"userEmail":{"type":"string","description":"If specified, logs will be filtered by email address"},"userMobile":{"type":"string","description":"If specified, logs will be filtered by mobile number. Should be in E.164 format."},"name":{"type":"string","description":"If specified, logs will be filtered by name. Must be exact match."},"from":{"type":"string","description":"something like 'now-14d' or ISO 8601 date string"},"to":{"type":"string","description":"something like 'now' or ISO 8601 date string"}},"required":["from","to"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}`,
      },
      {
        embeddingId: "venue_getCustomersOnDineInDates",
        similarity: 0.5367403483885874,
        serviceName: "venue",
        functionName: "getCustomersOnDineInDates",
        description: "Function for the getCustomersOnDineInDates operation",
        schema:
          '{"type":"object","properties":{"venueId":{"type":"string","description":"The venue id"},"startDate":{"type":"string","description":"The start date in YYYY-MM-DD HH:MM:SS format. Example: 2024-08-01 00:00:00. Always use 00:00:00 as the time."},"endDate":{"type":"string","description":"The end date in YYYY-MM-DD HH:MM:SS format. Example: 2024-08-02 00:00:00. Always use 00:00:00 as the time."}},"required":["venueId","startDate","endDate"],"additionalProperties":false,"description":"Returns a list of customers who ordered with a venue during a given date range","$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "venue_extractTextFromEmail",
        similarity: 0.5322399903858777,
        serviceName: "venue",
        functionName: "extractTextFromEmail",
        description: "Feed in an email URL and get the parsed text back",
        schema:
          '{"type":"object","properties":{"emailUrl":{"type":"string","format":"uri"},"withHtml":{"type":"boolean","default":false,"description":"Whether to include the HTML body of the email in the output. By default, only the plain text body is returned."}},"required":["emailUrl"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "datadog_getRedOrderBatchesForVenue",
        similarity: 0.5191342090650488,
        serviceName: "datadog",
        functionName: "getRedOrderBatchesForVenue",
        description:
          "Returns a list of red order batchIds for a given venue, with a given date range",
        schema: `{"type":"object","properties":{"venueId":{"type":"string","description":"The venueId to filter by"},"from":{"type":"string","description":"something like 'now-1d' or ISO 8601 date string"},"to":{"type":"string","description":"something like 'now' or ISO 8601 date string"}},"required":["venueId","from","to"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}`,
      },
      {
        embeddingId: "zendesk_ListTicketComments",
        similarity: 0.5185125804316446,
        serviceName: "zendesk",
        functionName: "ListTicketComments",
        description: "List Comments",
        schema:
          '{"type":"object","properties":{"include_inline_images":{"type":"boolean"},"include":{"type":"string","description":"Accepts \\"users\\". Use this parameter to list email CCs by side-loading users. Example: `?include=users`. **Note**: If the comment source is email, a deleted user will be represented as the CCd email address. If the comment source is anything else, a deleted user will be represented as the user name."},"ticket_id":{"type":"integer","description":"The ID of the ticket"},"per_page":{"type":"integer","description":"The number of records to return in each page."},"sort_order":{"type":"string","enum":["asc","desc"]}},"required":["ticket_id"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "venue_searchOrdersInAVenue",
        similarity: 0.517819962984393,
        serviceName: "venue",
        functionName: "searchOrdersInAVenue",
        description: "Function for the searchOrdersInAVenue operation",
        schema:
          '{"type":"object","properties":{"venueId":{"type":"string"},"searchQuery":{"type":"string","description":"Customer phone number, name or email (Only provide one term)"},"skip":{"type":"number","description":"Must be 0"},"limit":{"type":"number","description":"Must be 10"}},"required":["venueId","searchQuery","skip","limit"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "venue_setSurchargeTimeBlocks",
        similarity: 0.5049556693106588,
        serviceName: "venue",
        functionName: "setSurchargeTimeBlocks",
        description: "Set the time blocks for a surcharge",
        schema:
          '{"type":"object","properties":{"input":{"type":"object","properties":{"discountId":{"type":"string"},"venueId":{"type":"string"},"sun":{"type":"array","items":{"type":"object","properties":{"startTime":{"type":"string"},"endTime":{"type":"string"}},"required":["startTime","endTime"],"additionalProperties":false}},"mon":{"type":"array","items":{"type":"object","properties":{"startTime":{"type":"string"},"endTime":{"type":"string"}},"required":["startTime","endTime"],"additionalProperties":false}},"tue":{"type":"array","items":{"type":"object","properties":{"startTime":{"type":"string"},"endTime":{"type":"string"}},"required":["startTime","endTime"],"additionalProperties":false}},"wed":{"type":"array","items":{"type":"object","properties":{"startTime":{"type":"string"},"endTime":{"type":"string"}},"required":["startTime","endTime"],"additionalProperties":false}},"thu":{"type":"array","items":{"type":"object","properties":{"startTime":{"type":"string"},"endTime":{"type":"string"}},"required":["startTime","endTime"],"additionalProperties":false}},"fri":{"type":"array","items":{"type":"object","properties":{"startTime":{"type":"string"},"endTime":{"type":"string"}},"required":["startTime","endTime"],"additionalProperties":false}},"sat":{"type":"array","items":{"type":"object","properties":{"startTime":{"type":"string"},"endTime":{"type":"string"}},"required":["startTime","endTime"],"additionalProperties":false}}},"required":["discountId","venueId"],"additionalProperties":false}},"required":["input"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "datadog_orderInformationByOrderId",
        similarity: 0.503109486754434,
        serviceName: "datadog",
        functionName: "orderInformationByOrderId",
        description:
          "Given an order ID, return information about the order like batch IDs, organization ID, venue ID, user IDs, and more.",
        schema:
          '{"type":"object","properties":{"orderId":{"type":"string"}},"required":["orderId"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "venue_searchVenues",
        similarity: 0.501077688724322,
        serviceName: "venue",
        functionName: "searchVenues",
        description: "Function for the searchVenues operation",
        schema: `{"type":"object","properties":{"searchQuery":{"type":"string","description":"Venue name partial to search for. If you can't find Joe's pizza, try searching for Joe."},"skip":{"type":"number","description":"Must be 0"},"limit":{"type":"number","description":"Must be 10"}},"required":["searchQuery","skip","limit"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}`,
      },
      {
        embeddingId: "datadog_getRedOrderReport",
        similarity: 0.4955514958665316,
        serviceName: "datadog",
        functionName: "getRedOrderReport",
        description:
          "Returns a list of red orders for a given venue, organization, or integration, with a given date range",
        schema: `{"type":"object","properties":{"venueId":{"type":"string","description":"If specified, logs will be filtered by venueId"},"organizationId":{"type":"string","description":"If specified, logs will be filtered by organizationId"},"integration":{"type":"string","description":"If specified, logs will be filtered by integration"},"from":{"type":"string","description":"something like 'now-1d' or ISO 8601 date string. defaults to 'now-1d'","default":"now-1d"},"to":{"type":"string","description":"something like 'now' or ISO 8601 date string","default":"now"}},"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}`,
      },
      {
        embeddingId: "venue_authenticate",
        similarity: 0.4947558174138633,
        serviceName: "venue",
        functionName: "authenticate",
        description:
          "Authenticate the session, when the token expires or authentication is needed. Does not require any input.",
        schema:
          '{"type":"object","properties":{},"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "venue_venueSurcharges",
        similarity: 0.4932242300106977,
        serviceName: "venue",
        functionName: "venueSurcharges",
        description: "View all surcharges and discounts for a venue",
        schema:
          '{"type":"object","properties":{"venueId":{"type":"string"},"includeInactive":{"type":"boolean"}},"required":["venueId"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "datadog_getLogs",
        similarity: 0.4916142170108251,
        serviceName: "datadog",
        functionName: "getLogs",
        description: "Function for getting logs",
        schema:
          '{"type":"object","properties":{"query":{"type":"string"},"cursor":{"type":"string"},"allLogs":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"attributes":{"type":"object","properties":{"timestamp":{"type":"string"},"message":{"type":"string"},"status":{"type":"string"},"service":{"type":"string"},"attributes":{},"correlationId":{"type":"string"}},"required":["timestamp","message","status","service"],"additionalProperties":false}},"required":["id","attributes"],"additionalProperties":false}},"limit":{"type":"number","default":100},"from":{"type":"string","default":"now-14d"},"to":{"type":"string","default":"now"}},"required":["query"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "venue_getOrderByIdAndVenueId",
        similarity: 0.4908698870772985,
        serviceName: "venue",
        functionName: "getOrderByIdAndVenueId",
        description: "Get an order by its id and venue id",
        schema:
          '{"type":"object","properties":{"orderId":{"type":"string"},"venueId":{"type":"string"}},"required":["orderId","venueId"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "venue_venueInfo",
        similarity: 0.4859772252962953,
        serviceName: "venue",
        functionName: "venueInfo",
        description: "Function for the venueInfo operation",
        schema:
          '{"type":"object","properties":{"venueId":{"type":"string"}},"required":["venueId"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "zendesk_ListTickets",
        similarity: 0.4832139408971461,
        serviceName: "zendesk",
        functionName: "ListTickets",
        description: "List Tickets",
        schema: `{"type":"object","properties":{"external_id":{"type":"string","description":"Lists tickets by external id. External ids don't have to be unique for each ticket. As a result, the request may return multiple tickets with the same external id."}},"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}`,
      },
      {
        embeddingId: "zendesk_ShowComment",
        similarity: 0.4776913301185588,
        serviceName: "zendesk",
        functionName: "ShowComment",
        description: "Getting Comments",
        schema:
          '{"type":"object","properties":{"request_id":{"type":"integer","description":"The ID of the request"},"ticket_comment_id":{"type":"integer","description":"The ID of the ticket comment"}},"required":["request_id","ticket_comment_id"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "datadog_analyze",
        similarity: 0.4761520740343854,
        serviceName: "datadog",
        functionName: "analyze",
        description:
          "Analyzes logs for a given batchId, orderId, or correlationId. Requires at least one.",
        schema: `{"type":"object","properties":{"batchId":{"type":"string","pattern":"^[a-zA-Z0-9-]+$","description":"The batchId to analyze"},"orderId":{"type":"string","pattern":"^[a-zA-Z0-9-]+$","description":"The orderId to analyze"},"correlationId":{"type":"string","pattern":"^[a-zA-Z0-9-]+$","description":"The correlationId to analyze"},"from":{"type":"string","description":"something like 'now-1d' or ISO 8601 date string"},"to":{"type":"string","description":"something like 'now' or ISO 8601 date string"}},"required":["from","to"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}`,
      },
      {
        embeddingId: "zendesk_ListTicketFields",
        similarity: 0.47341114881854307,
        serviceName: "zendesk",
        functionName: "ListTicketFields",
        description: "List Ticket Fields",
        schema:
          '{"type":"object","properties":{},"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "zendesk_PutTagsTicket",
        similarity: 0.4688361615479324,
        serviceName: "zendesk",
        functionName: "PutTagsTicket",
        description: "Add Tags",
        schema:
          '{"type":"object","properties":{"ticket_id":{"type":"integer","description":"The ID of the ticket"},"tags":{"type":"array","items":{"type":"string"},"description":"An array of tags to add to the ticket"}},"required":["ticket_id","tags"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "zendesk_ShowTicket",
        similarity: 0.4682806538205265,
        serviceName: "zendesk",
        functionName: "ShowTicket",
        description: "Show Ticket",
        schema:
          '{"type":"object","properties":{"ticket_id":{"type":"integer","description":"The ID of the ticket"}},"required":["ticket_id"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "venue_healthCheck",
        similarity: 0.4678846506181633,
        serviceName: "venue",
        functionName: "healthCheck",
        description: "Check whether the venue service is healthy",
        schema:
          '{"type":"object","properties":{},"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "venue_extractTextFromImage",
        similarity: 0.46065161699019086,
        serviceName: "venue",
        functionName: "extractTextFromImage",
        description: "Feed in a image URL and get the text back",
        schema:
          '{"type":"object","properties":{"imageUrl":{"type":"string"}},"required":["imageUrl"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "zendesk_ShowUser",
        similarity: 0.4531383081278044,
        serviceName: "zendesk",
        functionName: "ShowUser",
        description: "Show User",
        schema:
          '{"type":"object","properties":{"user_id":{"type":"integer","description":"The id of the user"}},"required":["user_id"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "zendesk_ListSearchResults",
        similarity: 0.4503034163491165,
        serviceName: "zendesk",
        functionName: "ListSearchResults",
        description: "List Search Results",
        schema:
          '{"type":"object","properties":{"query":{"type":"string","description":"The search query. See [Query basics](#query-basics) above. For details on the query syntax, see the [Zendesk Support search reference](https://support.zendesk.com/hc/en-us/articles/203663226)"},"sort_by":{"type":"string","description":"One of `updated_at`, `created_at`, `priority`, `status`, or `ticket_type`. Defaults to sorting by relevance"},"sort_order":{"type":"string","description":"One of `asc` or `desc`.  Defaults to `desc`"}},"required":["query"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "zendesk_ListViews",
        similarity: 0.431454498023752,
        serviceName: "zendesk",
        functionName: "ListViews",
        description: "List Views",
        schema:
          '{"type":"object","properties":{"access":{"type":"string","description":"Only views with given access. May be \\"personal\\", \\"shared\\", or \\"account\\""},"active":{"type":"boolean","description":"Only active views if true, inactive views if false"},"group_id":{"type":"integer","description":"Only views belonging to given group"},"sort_by":{"type":"string","description":"Possible values are \\"alphabetical\\", \\"created_at\\", or \\"updated_at\\". Defaults to \\"position\\""},"sort_order":{"type":"string","description":"One of \\"asc\\" or \\"desc\\". Defaults to \\"asc\\" for alphabetical and position sort, \\"desc\\" for all others"}},"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "zendesk_ShowView",
        similarity: 0.42405284768976315,
        serviceName: "zendesk",
        functionName: "ShowView",
        description: "Show View",
        schema:
          '{"type":"object","properties":{"view_id":{"type":"integer","description":"The ID of the view"}},"required":["view_id"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "zendesk_Teardown",
        similarity: 0.413273533640901,
        serviceName: "zendesk",
        functionName: "Teardown",
        description:
          "Remove all Inferable-related triggers and webhooks from this Zendesk account.",
        schema:
          '{"type":"object","properties":{},"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "utility_searchTheWeb",
        similarity: 0.4087173535242239,
        serviceName: "utility",
        functionName: "searchTheWeb",
        description:
          "Search the web for information. For example, public holidays for a particular country and state.",
        schema:
          '{"type":"object","properties":{"searchQuery":{"type":"string"}},"required":["searchQuery"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "ZendeskEvents_setup",
        similarity: 0.3773994373486045,
        serviceName: "ZendeskEvents",
        functionName: "setup",
        schema:
          '{"type":"object","properties":{},"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "ZendeskEvents_getTriggers",
        similarity: 0.36727162001702396,
        serviceName: "ZendeskEvents",
        functionName: "getTriggers",
        schema:
          '{"type":"object","properties":{},"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "ZendeskEvents_getWebhooks",
        similarity: 0.34431527635103554,
        serviceName: "ZendeskEvents",
        functionName: "getWebhooks",
        schema:
          '{"type":"object","properties":{},"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
    ];

    const clusters = mostRelevantKMeansCluster(tools);
    expect(clusters).toEqual([
      {
        embeddingId: "venue_validateMemberCSV",
        similarity: 0.7102827858523657,
        serviceName: "venue",
        functionName: "validateMemberCSV",
        description: "Function for validating member CSV upload",
        schema:
          '{"type":"object","properties":{"data":{"type":"array","items":{"type":"string"},"minItems":2,"description":"CSV data as a string array"}},"required":["data"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "venue_bulkUploadMembers",
        similarity: 0.6481761863085908,
        serviceName: "venue",
        functionName: "bulkUploadMembers",
        description:
          "Function for bulk uploading members. Only call with 1000 records at a time.",
        schema:
          '{"type":"object","properties":{"data":{"type":"object","properties":{"members":{"type":"array","items":{"type":"object","properties":{"email":{"type":"string"},"expiration":{"type":"string"},"firstName":{"type":"string"},"lastName":{"type":"string"},"memberId":{"type":"string"},"mobile":{"type":"string"},"tier":{"type":"string"}},"required":["email","expiration","firstName","lastName","memberId","mobile","tier"],"additionalProperties":false}},"organizationId":{"type":"string"}},"required":["members","organizationId"],"additionalProperties":false}},"required":["data"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}',
      },
      {
        embeddingId: "venue_getTabOrdersForUser",
        similarity: 0.5688057263962708,
        serviceName: "venue",
        functionName: "getTabOrdersForUser",
        description:
          "Retrieve and group all orders for a user by socialTabId. This function will recursively fetch all orders, up to a maximum of 1000 orders (10 calls with 100 limit each).",
        schema: `{"type":"object","properties":{"venueId":{"type":"string"},"userIdentifier":{"type":"string","description":"User's email or phone number. Must be a valid email or phone number with a country code. Example: +61412345678 for an Australian phone number."},"venueSlug":{"type":"string","description":"The slug of the venue. Example: shawntest. If you don't have this, use venueInfo to get it."},"skip":{"type":"number","default":0},"limit":{"type":"number","default":100},"recursionCount":{"type":"number","default":0}},"required":["venueId","userIdentifier","venueSlug"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}`,
      },
    ]);
  });
});
