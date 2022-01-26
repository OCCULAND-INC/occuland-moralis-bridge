require("dotenv").config();
const fs = require('fs');
const app = require('express')();
const bodyParser = require('body-parser');
const server = require('http').Server(app);
var cors = require('cors');
const Web3 = require('web3');


const infura = process.env.INFURA_API_KEY;  
const web3Eth = new Web3(infura);
const moralis = process.env.MORALIS_API_KEY;
const web3Avax = new Web3(moralis);

const PORT = process.env.PORT || 5000;

const dclAbi =  JSON.parse(fs.readFileSync('./contracts/Land.json')).abi;
const dclContract = new web3Eth.eth.Contract(dclAbi, process.env.CONTRACT_ADDRESS);

const occulandAbi = JSON.parse(fs.readFileSync('./contracts/Occuland.json')).abi;
const occulandContract = new web3Avax.eth.Contract(occulandAbi, process.env.AVAX_OCCULAND_ADDRESS);

const mintAddress = '0x0000000000000000000000000000000000000000';

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));

async function run() {
    const bridgeAssetBackToEth = async (fn, txn) => {
        if(compareTransactions){
            try {
                const method = await dclContract.methods.transferFrom(process.env.OCCULAND_WALLET, txn.from, txn.assetId);
                const txnToSend = {
                    from: process.env.OCCULAND_WALLET,
                    to: txn.from,
                    gas: 1000000,
                    data: method.encodeABI(),
                }
    
                const signedTxn = await web3Eth.eth.accounts.signTransaction(txnToSend, process.env.MINTER_PRIVATE_KEY);
                await web3Eth.eth.sendSignedTransaction(signedTxn.rawTransaction).on('receipt', console.log);
                fn.sendStatus(200);
            } catch(e) {
                console.log(`TXN_ERROR: ${txn.from} transfer error. ID ${txn.objectId}`);
                fn.sendStatus(400);
            }
        } else {
            console.log(`TXN_ERROR: ${txn.from} transfer error. ID ${txn.objectId}`);
            fn.sendStatus(400);
        }
    }
    
    const compareTransactions = async (txn) => {
        let retrievedTxn = await getTransction(txn.transaction_hash);
        if(
            retrievedTxn.blockHash == txn.blockHash && 
            retrievedTxn.from == txn.from && 
            retrievedTxn.to == txn.address && 
            retrievedTxn.to == process.env.AVAX_OCCULAND_ADDRESS
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

    try {
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
                    const signedTxn = await web3Avax.eth.accounts.signTransaction(txn, process.env.MINTER_PRIVATE_KEY);
                    await web3Avax.eth.sendSignedTransaction(signedTxn.rawTransaction).on('receipt', console.log);
                } catch(e) {
                    console.log('avax signing error');
                }
            }

        });
    } catch(e) {
        console.log('listenining error')
    }

    app.get('/', async (req, res) =>  {
        let x = req.body;
        res.send("app is running . . .");
    });

    app.post('/KGGpWFQm6gQEnrEGbw1a1WBOfotDrvGjG6rhcg9G', async (req, res) =>  {
        let x = req.body;
        bridgeAssetBackToEth(res, x.object);
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