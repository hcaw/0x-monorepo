import { LogWithDecodedArgs, TransactionReceiptWithDecodedLogs, ZeroEx } from '0x.js';
import { BlockchainLifecycle, devConstants, web3Factory } from '@0xproject/dev-utils';
import { BigNumber } from '@0xproject/utils';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
import * as chai from 'chai';
import * as Web3 from 'web3';

import { AssetProxyDispatcherContract } from '../../src/contract_wrappers/generated/asset_proxy_dispatcher';
import { DummyERC721TokenContract } from '../../src/contract_wrappers/generated/dummy_e_r_c721_token';
import { DummyTokenContract } from '../../src/contract_wrappers/generated/dummy_token';
import { ERC20ProxyContract } from '../../src/contract_wrappers/generated/e_r_c20_proxy';
import { ERC721ProxyContract } from '../../src/contract_wrappers/generated/e_r_c721_proxy';
import { ERC20Proxy_v1Contract } from '../../src/contract_wrappers/generated/erc20proxy_v1';
import { TokenTransferProxyContract } from '../../src/contract_wrappers/generated/token_transfer_proxy';
import { encodeERC20ProxyData, encodeERC20V1ProxyData, encodeERC721ProxyData } from '../../src/utils/asset_proxy_utils';
import { Balances } from '../../src/utils/balances';
import { constants } from '../../src/utils/constants';
import { AssetProxyId, ContractName } from '../../src/utils/types';
import { chaiSetup } from '../utils/chai_setup';
import { deployer } from '../utils/deployer';
import { provider, web3Wrapper } from '../utils/web3_wrapper';

chaiSetup.configure();
const expect = chai.expect;
const blockchainLifecycle = new BlockchainLifecycle(web3Wrapper);

describe('Asset Transfer Proxies', () => {
    let owner: string;
    let notOwner: string;
    let assetProxyDispatcherAddress: string;
    let tokenOwner: string;
    let makerAddress: string;
    let takerAddress: string;
    let zrx: DummyTokenContract;
    let erc721Token: DummyERC721TokenContract;
    let dmyBalances: Balances;
    let tokenTransferProxy: TokenTransferProxyContract;
    let erc20TransferProxyV1: ERC20Proxy_v1Contract;
    let erc20TransferProxy: ERC20ProxyContract;
    let erc721TransferProxy: ERC721ProxyContract;
    const makerTokenId = new BigNumber('0x1010101010101010101010101010101010101010101010101010101010101010');
    const testAddressPaddedWithZeros = '0x0000000000000000056000000000000000000010';
    const INITIAL_BALANCE = new BigNumber(10000);

    before(async () => {
        // Setup accounts & addresses
        const accounts = await web3Wrapper.getAvailableAddressesAsync();
        owner = tokenOwner = accounts[0];
        notOwner = accounts[1];
        assetProxyDispatcherAddress = accounts[2];
        makerAddress = accounts[3];
        takerAddress = accounts[4];
        // Deploy TokenTransferProxy
        const tokenTransferProxyInstance = await deployer.deployAsync(ContractName.TokenTransferProxy);
        tokenTransferProxy = new TokenTransferProxyContract(
            tokenTransferProxyInstance.abi,
            tokenTransferProxyInstance.address,
            provider,
        );
        // Deploy ERC20 V1 Proxy
        const erc20TransferProxyV1Instance = await deployer.deployAsync(ContractName.ERC20V1Proxy, [
            tokenTransferProxy.address,
        ]);
        erc20TransferProxyV1 = new ERC20Proxy_v1Contract(
            erc20TransferProxyV1Instance.abi,
            erc20TransferProxyV1Instance.address,
            provider,
        );
        await erc20TransferProxyV1.addAuthorizedAddress.sendTransactionAsync(assetProxyDispatcherAddress, {
            from: owner,
        });
        await tokenTransferProxy.addAuthorizedAddress.sendTransactionAsync(erc20TransferProxyV1.address, {
            from: owner,
        });
        // Deploy ERC20 Proxy
        const erc20TransferProxyInstance = await deployer.deployAsync(ContractName.ERC20Proxy);
        erc20TransferProxy = new ERC20ProxyContract(
            erc20TransferProxyInstance.abi,
            erc20TransferProxyInstance.address,
            provider,
        );
        await erc20TransferProxy.addAuthorizedAddress.sendTransactionAsync(assetProxyDispatcherAddress, {
            from: owner,
        });
        // Deploy ERC721 Proxy
        const erc721TransferProxyInstance = await deployer.deployAsync(ContractName.ERC721Proxy);
        erc721TransferProxy = new ERC721ProxyContract(
            erc721TransferProxyInstance.abi,
            erc721TransferProxyInstance.address,
            provider,
        );
        await erc721TransferProxy.addAuthorizedAddress.sendTransactionAsync(assetProxyDispatcherAddress, {
            from: owner,
        });
        // Deploy zrx and set initial balances
        const zrxInstance = await deployer.deployAsync(ContractName.DummyToken, constants.DUMMY_TOKEN_ARGS);
        zrx = new DummyTokenContract(zrxInstance.abi, zrxInstance.address, provider);
        await zrx.setBalance.sendTransactionAsync(makerAddress, INITIAL_BALANCE, { from: tokenOwner });
        await zrx.setBalance.sendTransactionAsync(takerAddress, INITIAL_BALANCE, { from: tokenOwner });
        dmyBalances = new Balances([zrx], [makerAddress, takerAddress]);
        await zrx.approve.sendTransactionAsync(tokenTransferProxy.address, INITIAL_BALANCE, {
            from: takerAddress,
        });
        await zrx.approve.sendTransactionAsync(tokenTransferProxy.address, INITIAL_BALANCE, {
            from: makerAddress,
        });
        await zrx.approve.sendTransactionAsync(erc20TransferProxy.address, INITIAL_BALANCE, {
            from: takerAddress,
        });
        await zrx.approve.sendTransactionAsync(erc20TransferProxy.address, INITIAL_BALANCE, {
            from: makerAddress,
        });
        // Deploy erc721Token and set initial balances
        const erc721TokenInstance = await deployer.deployAsync(
            ContractName.DummyERC721Token,
            constants.DUMMY_ERC721TOKEN_ARGS,
        );
        erc721Token = new DummyERC721TokenContract(erc721TokenInstance.abi, erc721TokenInstance.address, provider);
        await erc721Token.setApprovalForAll.sendTransactionAsync(erc721TransferProxy.address, true, {
            from: makerAddress,
        });
        await erc721Token.setApprovalForAll.sendTransactionAsync(erc721TransferProxy.address, true, {
            from: takerAddress,
        });
        await erc721Token.mint.sendTransactionAsync(makerAddress, makerTokenId, { from: tokenOwner });
    });
    beforeEach(async () => {
        await blockchainLifecycle.startAsync();
    });
    afterEach(async () => {
        await blockchainLifecycle.revertAsync();
    });
    describe('Transfer Proxy - ERC20V1', () => {
        it('should successfully encode/decode metadata', async () => {
            const metadata = await erc20TransferProxyV1.encodeMetadata.callAsync(AssetProxyId.ERC20V1, zrx.address);
            const address = await erc20TransferProxyV1.decodeMetadata.callAsync(metadata);
            expect(address).to.be.equal(zrx.address);
        });

        it('should successfully decode metadata encoded by typescript helpers', async () => {
            const metadata = encodeERC20V1ProxyData(zrx.address);
            const address = await erc20TransferProxyV1.decodeMetadata.callAsync(metadata);
            expect(address).to.be.equal(zrx.address);
        });

        it('should successfully encode/decode metadata padded with zeros', async () => {
            const metadata = await erc20TransferProxyV1.encodeMetadata.callAsync(
                AssetProxyId.ERC20V1,
                testAddressPaddedWithZeros,
            );
            const address = await erc20TransferProxyV1.decodeMetadata.callAsync(metadata);
            expect(address).to.be.equal(testAddressPaddedWithZeros);
        });

        it('should successfully decode metadata encoded padded with zeros by typescript helpers', async () => {
            const metadata = encodeERC20V1ProxyData(testAddressPaddedWithZeros);
            const address = await erc20TransferProxyV1.decodeMetadata.callAsync(metadata);
            expect(address).to.be.equal(testAddressPaddedWithZeros);
        });

        it('should successfully transfer tokens', async () => {
            // Construct metadata for ERC20 proxy
            const encodedProxyMetadata = encodeERC20V1ProxyData(zrx.address);
            // Perform a transfer from makerAddress to takerAddress
            const balances = await dmyBalances.getAsync();
            const amount = new BigNumber(10);
            await erc20TransferProxyV1.transferFrom.sendTransactionAsync(
                encodedProxyMetadata,
                makerAddress,
                takerAddress,
                amount,
                { from: assetProxyDispatcherAddress },
            );
            // Verify transfer was successful
            const newBalances = await dmyBalances.getAsync();
            expect(newBalances[makerAddress][zrx.address]).to.be.bignumber.equal(
                balances[makerAddress][zrx.address].minus(amount),
            );
            expect(newBalances[takerAddress][zrx.address]).to.be.bignumber.equal(
                balances[takerAddress][zrx.address].add(amount),
            );
        });

        it('should throw if requesting address is not owner', async () => {
            // Construct metadata for ERC20 proxy
            const encodedProxyMetadata = encodeERC20V1ProxyData(zrx.address);
            // Perform a transfer from makerAddress to takerAddress
            const balances = await dmyBalances.getAsync();
            const amount = new BigNumber(10);
            expect(
                erc20TransferProxyV1.transferFrom.sendTransactionAsync(
                    encodedProxyMetadata,
                    makerAddress,
                    takerAddress,
                    amount,
                    { from: notOwner },
                ),
            ).to.be.rejectedWith(constants.REVERT);
        });
    });

    describe('Transfer Proxy - ERC20', () => {
        it('should successfully encode/decode metadata', async () => {
            const metadata = await erc20TransferProxy.encodeMetadata.callAsync(AssetProxyId.ERC20, zrx.address);
            const address = await erc20TransferProxy.decodeMetadata.callAsync(metadata);
            expect(address).to.be.equal(zrx.address);
        });

        it('should successfully decode metadata encoded by typescript helpers', async () => {
            const metadata = encodeERC20ProxyData(zrx.address);
            const address = await erc20TransferProxy.decodeMetadata.callAsync(metadata);
            expect(address).to.be.equal(zrx.address);
        });

        it('should successfully encode/decode metadata padded with zeros', async () => {
            const metadata = await erc20TransferProxy.encodeMetadata.callAsync(
                AssetProxyId.ERC20,
                testAddressPaddedWithZeros,
            );
            const address = await erc20TransferProxy.decodeMetadata.callAsync(metadata);
            expect(address).to.be.equal(testAddressPaddedWithZeros);
        });

        it('should successfully decode metadata encoded padded with zeros by typescript helpers', async () => {
            const metadata = encodeERC20ProxyData(testAddressPaddedWithZeros);
            const address = await erc20TransferProxy.decodeMetadata.callAsync(metadata);
            expect(address).to.be.equal(testAddressPaddedWithZeros);
        });

        it('should successfully transfer tokens', async () => {
            // Construct metadata for ERC20 proxy
            const encodedProxyMetadata = encodeERC20ProxyData(zrx.address);
            // Perform a transfer from makerAddress to takerAddress
            const balances = await dmyBalances.getAsync();
            const amount = new BigNumber(10);
            await erc20TransferProxy.transferFrom.sendTransactionAsync(
                encodedProxyMetadata,
                makerAddress,
                takerAddress,
                amount,
                { from: assetProxyDispatcherAddress },
            );
            // Verify transfer was successful
            const newBalances = await dmyBalances.getAsync();
            expect(newBalances[makerAddress][zrx.address]).to.be.bignumber.equal(
                balances[makerAddress][zrx.address].minus(amount),
            );
            expect(newBalances[takerAddress][zrx.address]).to.be.bignumber.equal(
                balances[takerAddress][zrx.address].add(amount),
            );
        });

        it('should throw if requesting address is not owner', async () => {
            // Construct metadata for ERC20 proxy
            const encodedProxyMetadata = encodeERC20ProxyData(zrx.address);
            // Perform a transfer from makerAddress to takerAddress
            const balances = await dmyBalances.getAsync();
            const amount = new BigNumber(10);
            expect(
                erc20TransferProxy.transferFrom.sendTransactionAsync(
                    encodedProxyMetadata,
                    makerAddress,
                    takerAddress,
                    amount,
                    { from: notOwner },
                ),
            ).to.be.rejectedWith(constants.REVERT);
        });
    });

    describe('Transfer Proxy - ERC721', () => {
        it('should successfully encode/decode metadata', async () => {
            const metadata = await erc721TransferProxy.encodeMetadata.callAsync(
                AssetProxyId.ERC721,
                erc721Token.address,
                makerTokenId,
            );
            const [address, tokenId] = await erc721TransferProxy.decodeMetadata.callAsync(metadata);
            expect(address).to.be.equal(erc721Token.address);
            expect(tokenId).to.be.bignumber.equal(makerTokenId);
        });

        it('should successfully decode metadata encoded by typescript helpers', async () => {
            const metadata = encodeERC721ProxyData(erc721Token.address, makerTokenId);
            const [address, tokenId] = await erc721TransferProxy.decodeMetadata.callAsync(metadata);
            expect(address).to.be.equal(erc721Token.address);
            expect(tokenId).to.be.bignumber.equal(makerTokenId);
        });

        it('should successfully encode/decode metadata padded with zeros', async () => {
            const metadata = await erc721TransferProxy.encodeMetadata.callAsync(
                AssetProxyId.ERC721,
                testAddressPaddedWithZeros,
                makerTokenId,
            );
            const [address, tokenId] = await erc721TransferProxy.decodeMetadata.callAsync(metadata);
            expect(address).to.be.equal(testAddressPaddedWithZeros);
            expect(tokenId).to.be.bignumber.equal(makerTokenId);
        });

        it('should successfully decode metadata encoded padded with zeros by typescript helpers', async () => {
            const metadata = encodeERC721ProxyData(testAddressPaddedWithZeros, makerTokenId);
            const [address, tokenId] = await erc721TransferProxy.decodeMetadata.callAsync(metadata);
            expect(address).to.be.equal(testAddressPaddedWithZeros);
            expect(tokenId).to.be.bignumber.equal(makerTokenId);
        });

        it('should successfully transfer tokens', async () => {
            // Construct metadata for ERC20 proxy
            const encodedProxyMetadata = encodeERC721ProxyData(erc721Token.address, makerTokenId);
            // Verify pre-condition
            const ownerMakerToken = await erc721Token.ownerOf.callAsync(makerTokenId);
            expect(ownerMakerToken).to.be.bignumber.equal(makerAddress);
            // Perform a transfer from makerAddress to takerAddress
            const balances = await dmyBalances.getAsync();
            const amount = new BigNumber(1);
            await erc721TransferProxy.transferFrom.sendTransactionAsync(
                encodedProxyMetadata,
                makerAddress,
                takerAddress,
                amount,
                { from: assetProxyDispatcherAddress },
            );
            // Verify transfer was successful
            const newOwnerMakerToken = await erc721Token.ownerOf.callAsync(makerTokenId);
            expect(newOwnerMakerToken).to.be.bignumber.equal(takerAddress);
        });

        it('should throw if transferring 0 amount of a token', async () => {
            // Construct metadata for ERC20 proxy
            const encodedProxyMetadata = encodeERC721ProxyData(erc721Token.address, makerTokenId);
            // Verify pre-condition
            const ownerMakerToken = await erc721Token.ownerOf.callAsync(makerTokenId);
            expect(ownerMakerToken).to.be.bignumber.equal(makerAddress);
            // Perform a transfer from makerAddress to takerAddress
            const balances = await dmyBalances.getAsync();
            const amount = new BigNumber(0);
            expect(
                erc20TransferProxy.transferFrom.sendTransactionAsync(
                    encodedProxyMetadata,
                    makerAddress,
                    takerAddress,
                    amount,
                    { from: assetProxyDispatcherAddress },
                ),
            ).to.be.rejectedWith(constants.REVERT);
        });

        it('should throw if transferring > 1 amount of a token', async () => {
            // Construct metadata for ERC20 proxy
            const encodedProxyMetadata = encodeERC721ProxyData(erc721Token.address, makerTokenId);
            // Verify pre-condition
            const ownerMakerToken = await erc721Token.ownerOf.callAsync(makerTokenId);
            expect(ownerMakerToken).to.be.bignumber.equal(makerAddress);
            // Perform a transfer from makerAddress to takerAddress
            const balances = await dmyBalances.getAsync();
            const amount = new BigNumber(500);
            expect(
                erc20TransferProxy.transferFrom.sendTransactionAsync(
                    encodedProxyMetadata,
                    makerAddress,
                    takerAddress,
                    amount,
                    { from: assetProxyDispatcherAddress },
                ),
            ).to.be.rejectedWith(constants.REVERT);
        });

        it('should throw if requesting address is not owner', async () => {
            // Construct metadata for ERC20 proxy
            const encodedProxyMetadata = encodeERC721ProxyData(zrx.address, makerTokenId);
            // Perform a transfer from makerAddress to takerAddress
            const balances = await dmyBalances.getAsync();
            const amount = new BigNumber(1);
            expect(
                erc20TransferProxy.transferFrom.sendTransactionAsync(
                    encodedProxyMetadata,
                    makerAddress,
                    takerAddress,
                    amount,
                    { from: notOwner },
                ),
            ).to.be.rejectedWith(constants.REVERT);
        });
    });
});