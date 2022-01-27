require("dotenv").config();
const fs = require('fs');
const app = require('express')();
const bodyParser = require('body-parser');
const server = require('http').Server(app);
var cors = require('cors');
const Web3 = require('web3');


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

async function run() {
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
                
                const mth = await occulandContract.methods.mint(
                    txn.from_address,
                    txn.token_id,
                    'fakeURI'
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
    
    const getTransction = async (txn_hash) => {
        let response = await web3Avax.eth.getTransaction(txn_hash);
        return response;
    }

    /*try {
        dclContract.events.Transfer().on('data', async function(event){
            if (event.returnValues.from != mintAddress && event.returnValues.to == process.env.OCCULAND_WALLET) {
                console.log(event.returnValues.from, 'just transfered', event.returnValues.tokenId, 'to our wallet!');

                const method = await occulandContract.methods.mint(
                    event.returnValues.from, 
                    event.returnValues.tokenId,
                    'fakeURI'
                );

                const txn = {
                    from: process.env.MINTER_ADDRESS,
                    to: process.env.AVAX_OCCULAND_ADDRESS,
                    gas: 1000000,
                    data: method.encodeABI(),
                }
                console.log(txn);

                try {
                    //const signedTxn = await web3Avax.eth.accounts.signTransaction(txn, process.env.MINTER_PRIVATE_KEY);
                    //await web3Avax.eth.sendSignedTransaction(signedTxn.rawTransaction).on('receipt', console.log);
                } catch(e) {
                    console.log('avax signing error');
                }
            }

        });
    } catch(e) {
        console.log('listenining error')
    }*/

    app.get('/', async (req, res) =>  {
        res.send("app is running . . .");
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