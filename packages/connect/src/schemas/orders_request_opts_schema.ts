export const ordersRequestOptsSchema = {
    id: '/OrdersRequestOpts',
    type: 'object',
    properties: {
        makerAssetProxyId: { $ref: '/hexSchema' },
        takerAssetProxyId: { $ref: '/hexSchema' },
        makerAssetAddress: { $ref: '/addressSchema' },
        takerAssetAddress: { $ref: '/addressSchema' },
        exchangeAddress: { $ref: '/addressSchema' },
        senderAddress: { $ref: '/addressSchema' },
        makerAssetData: { $ref: '/hexSchema' },
        takerAssetData: { $ref: '/hexSchema' },
        traderAssetData: { $ref: '/hexSchema' },
        makerAddress: { $ref: '/addressSchema' },
        takerAddress: { $ref: '/addressSchema' },
        traderAddress: { $ref: '/addressSchema' },
        feeRecipientAddress: { $ref: '/addressSchema' },
    },
};
