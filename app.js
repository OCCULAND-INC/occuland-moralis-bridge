require("dotenv").config();
const fs = require('fs');
const app = require('express')();
const server = require('http').Server(app);
const Web3 = require('web3');


const infura = process.env.INFURA_API_KEY;  
const web3Eth = new Web3(infura);
const moralis = process.env.MORALIS_API_KEY;
const web3Avax = new Web3(moralis);

const PORT = process.env.PORT || 5000;

const dclAbi =  JSON.parse(fs.readFileSync('./contracts/Land.json')).abi;
const dclContract = new web3Eth.eth.Contract(dclAbi, process.env.CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000');

const occulandAbi = JSON.parse(fs.readFileSync('./contracts/Occuland.json')).abi;
const occulandContract = new web3Avax.eth.Contract(occulandAbi, process.env.AVAX_OCCULAND_ADDRESS || '0x0000000000000000000000000000000000000000');

const mintAddress = '0x0000000000000000000000000000000000000000';

async function run() {

    dclContract.events.Transfer().on('data', async function(event){
        if (event.returnValues.from != mintAddress && event.returnValues.to == process.env.OCCULAND_WALLET) {
            console.log(event.returnValues.from, 'just transfered', event.returnValues.tokenId, 'to our wallet!');

            const method = await occulandContract.methods.mint(event.returnValues.from, event.returnValues.tokenId);

            const txn = {
                from: process.env.MINTER_ADDRESS,
                to: process.env.OCCULAND_WALLET,
                gas: 1000000,
                data: method.encodeABI(),
            }

            try {
                const signedTxn = await web3Avax.eth.accounts.signTransaction(txn, process.env.MINTER_PRIVATE_KEY);
                await web3Avax.eth.sendSignedTransaction(signedTxn.rawTransaction).on('receipt', console.log);
            } catch(e) {

            }
        }
    });

    server.listen(PORT,() => {
        console.log(`Listening on port ${PORT} . . .`);
        
    });
}

run().catch(console.error);