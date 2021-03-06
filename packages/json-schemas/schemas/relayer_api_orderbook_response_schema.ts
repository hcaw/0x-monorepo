export const relayerApiOrderbookResponseSchema = {
    id: '/relayerApiOrderbookResponseSchema',
    type: 'object',
    properties: {
        bids: { $ref: '/relayerApiOrdersResponseSchema' },
        asks: { $ref: '/relayerApiOrdersResponseSchema' },
    },
    required: ['bids', 'asks'],
};
