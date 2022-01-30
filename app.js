require("dotenv").config();

const NFTStorage = require('nft.storage');
const File = require('nft.storage');
const client = new NFTStorage.NFTStorage({ token: process.env.NFTStorage })
const fs = require('fs');
const app = require('express')();
const bodyParser = require('body-parser');
const server = require('http').Server(app);
const fetch = require('node-fetch');
const querystring = require('querystring');
var cors = require('cors');
const Web3 = require('web3');
const res = require("express/lib/response");

const infura = process.env.INFURA_API_KEY;  
const web3Eth = new Web3(infura);

const web3EthHttps = new Web3(process.env.MORALIS_ETH_API_KEY);


const moralis = process.env.MORALIS_API_KEY;
const web3Avax = new Web3(moralis);

const PORT = process.env.PORT || 5000;

const dclAbi =  JSON.parse(fs.readFileSync('./contracts/Land.json')).abi;


const dclContractHttp = new web3EthHttps.eth.Contract(dclAbi, process.env.CONTRACT_ADDRESS);

const occulandAbi = JSON.parse(fs.readFileSync('./contracts/Occuland.json')).abi;
const occulandContract = new web3Avax.eth.Contract(occulandAbi, process.env.AVAX_OCCULAND_ADDRESS);

const mintAddress = '0x0000000000000000000000000000000000000000';

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));


//qs: {where: `{"token_id": "${token_id}", "confirmed": true, "from_address": "${address_from}", "transaction_hash": "${hash}"}`},
async function run() {

    const createURI = async (
        _platform,
        _assetId,
        _txnHash,
        _owner
    ) => {
        const metadata = await client.store({
            name: 'Occuland LAND IOU',
            description: 'This token represents a claim to the asset entrusted to Occuland. The details herein is that of the asset and its transfer.',
            image: new File.File([],'none.jpg',{ type: 'image/jpg' }),
            asset:{
                platform: _platform,
                asset_id: _assetId,
                transaction_hash: _txnHash,
                owner: _owner,
            }
        });
        return metadata.url;
    }
    const fetchStatsOfTransfer = async (address_from, token_id, hash, cb) => {
        let url = `https://cdh7zfwna37q.usemoralis.com:2053/server/classes/EthNFTTransfers?where=%7B%22token_id%22%3A%22${token_id}%22,%20%22from_address%22%3A%22${address_from}%22,%20%22transaction_hash%22%3A%22${hash}%22,%20%22confirmed%22%3Atrue%7D`;
        let options = {
          method: 'GET',
          headers: {
            'x-parse-application-id': 'V00aPRpd4SM8R96PbFVOLt1AMHQqLjFXkmH3Qax0',
            'x-parse-rest-api-key': 'y1BnljX3CcEDZg0'
          }
        };
        await fetch(url, options)
          .then(res => cb(res))
          .catch(err => console.error('error:' + err)); 

    }
    const bridgeAssetToAvax = async (txn) => {
        let comp = await compareTransactions(txn, web3EthHttps, process.env.CONTRACT_ADDRESS, txn.from_address);
        if(
            comp && 
            txn.contract_type == 'ERC721' && 
            web3EthHttps.utils.toChecksumAddress(txn.to_address) == web3EthHttps.utils.toChecksumAddress(process.env.MINTER_ADDRESS) &&
            txn.confirmed
        ){
            try {
                console.log(`tx hash: ${txn.transaction_hash}`);
                console.log(`Transferred in asset id: ${txn.token_id}`);
                //console.log(txn);
                const nonce = await web3Avax.eth.getTransactionCount(process.env.MINTER_ADDRESS, 'latest');

                let URI = await createURI(
                    "Decentraland",
                    txn.token_id,
                    txn.transaction_hash,
                    txn.from_address
                );
                
                const mth = await occulandContract.methods.mint(
                    txn.from_address,
                    txn.token_id,
                    URI
                );

                const txnToSend = {
                    from: process.env.MINTER_ADDRESS,
                    to: process.env.AVAX_OCCULAND_ADDRESS,
                    gas: 1000000,
                    data: mth.encodeABI(),
                    nonce:nonce
                }
    
                const signedTxn = await web3Avax.eth.accounts.signTransaction(txnToSend, process.env.MINTER_PRIVATE_KEY);
                await web3Avax.eth.sendSignedTransaction(signedTxn.rawTransaction).on('receipt', () => {});
                console.log(`Transferred in asset id: ${txn.token_id}. SUCCESS.`)
                //fn.sendStatus(200);
            } catch(e) {
                console.log(`TXN_ERROR: ${txn.from_address} transfer error. ID ${txn.objectId}`);
                //fn.sendStatus(400);
            }
        } else {
            //onsole.log(`COMPARE_ERROR: ${txn.from_address} transfer error. ID ${txn.objectId}`);
            //fn.sendStatus(400);
        }
    }

    const bridgeAssetBackToEth = async (txn) => {
        //console.log(txn);
        let comp = await compareTransactions(txn, web3Avax, process.env.AVAX_OCCULAND_ADDRESS, txn.from);
        if(
            comp && 
            web3EthHttps.utils.toChecksumAddress(txn.address) == web3EthHttps.utils.toChecksumAddress(process.env.AVAX_OCCULAND_ADDRESS) &&
            txn.confirmed == true
        ){
            try {
                console.log(`tx hash: ${txn.transaction_hash}`);
                console.log(`Transferring back asset id: ${txn.assetId} ID ${txn.objectId}`);
                const nonce = await web3EthHttps.eth.getTransactionCount(process.env.OCCULAND_WALLET, 'latest');
                
                const mth = await dclContractHttp.methods.transferFrom(
                    process.env.OCCULAND_WALLET, 
                    txn.from, 
                    parseInt(txn.assetId)
                );

                const txnToSend = {
                    from: process.env.OCCULAND_WALLET,
                    to: process.env.CONTRACT_ADDRESS,
                    gas: 1000000,
                    data: mth.encodeABI(),
                    nonce:nonce
                }
                const signedTxn = await web3EthHttps.eth.accounts.signTransaction(txnToSend, process.env.MINTER_PRIVATE_KEY);
                await web3EthHttps.eth.sendSignedTransaction(signedTxn.rawTransaction).on('receipt', () => {});
                console.log(`Transferred back asset id: ${txn.assetId}. SUCCESS.`);
                //fn.sendStatus(200);
            } catch(e) {
                console.log(`TXN_ERROR: ${txn.from} transfer error. ID ${txn.objectId}`);
                //fn.sendStatus(400);
            }
        } else {
            //console.log(`COMPARE_ERROR: ${txn.from} transfer error. ID ${txn.objectId}`);
            //fn.sendStatus(400);
        }
    }
    
    const compareTransactions = async (txn, provider, to, from) => {
        let retrievedTxn = await provider.eth.getTransaction(txn.transaction_hash);
        //console.log(retrievedTxn);
        if(
            retrievedTxn.blockHash == txn.block_hash && 
            provider.utils.toChecksumAddress(retrievedTxn.from) == provider.utils.toChecksumAddress(from) && 
            provider.utils.toChecksumAddress(retrievedTxn.to) == provider.utils.toChecksumAddress(to)
        ){
            return true;
        } else {
            return false;
        }
    }

    app.get('/', async (req, res) =>  {
        res.send("app is running . . .");
    });

    app.get('/status', async (req, response) =>  {
        let address = req.query['/address'] || req.query.address ;
        let assetId = req.query.assetId;
        let hash = req.query.hash;
        let address2 = address.toLowerCase();
        console.log(`checking status: ${hash} assetId: ${assetId} address: ${address2}`)
        await fetchStatsOfTransfer(
            address2,
            assetId, 
            hash,
            async (res) => {
                let x = await res.json();
                if(x.results.length > 0){
                    console.log(x.results[0].confirmed);
                    response.send('confirmed');
                } else {
                    response.send('pending');
                }
            }
        );
    });

    app.post('/transferout/tTyuQAMoj9TsbZAT7Ie8PTgWdbxILlnKKmN10xfC', async (req, res) =>  {
        let x = req.body;
        bridgeAssetBackToEth(x.object);
        res.statusCode = 200;
        res.send();
    });

    app.post('/transferin/KGGpWFQm6gQEnrEGbw1a1WBOfotDrvGjG6rhcg9G', async (req, res) =>  {
        let x = req.body;
        bridgeAssetToAvax(x.object);
        res.statusCode = 200;
        res.send();
    });

    app.post('/rentto/et8dtUHR8G3TXOFeTkfZhSmGcwRg660DrKsCU266', async (req, res) =>  {
        let x = req.body;
        //bridgeAssetBackToEth(res, x.object);
    });

    server.listen(PORT,() => {
        console.log(`Listening on port ${PORT} . . .`);
        
    });
}

run().catch(console.error);