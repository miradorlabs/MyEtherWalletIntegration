import { toBN, toHex, toChecksumAddress, isHexStrict } from 'web3-utils';
import { ParallaxClient } from '@miradorlabs/parallax';
import { isAddress } from '@/core/helpers/addressUtils';
import SanitizeHex from '@/core/helpers/sanitizeHex';
import { Transaction } from '@ethereumjs/tx';
import { mapState, mapGetters } from 'vuex';
import vuexStore from '@/core/store';
import ErrorList from '../errors';
import Web3Contract from 'web3-eth-contract';
import { MAIN_TOKEN_ADDRESS } from '@/core/helpers/common';
import hasValidDecimals from '@/core/helpers/hasValidDecimals.js';
import { isNull } from 'lodash';
import BigNumber from 'bignumber.js';
import { toBNSafe } from '@/core/helpers/numberFormatHelper';

class SendTransaction {
  constructor() {
    this.$store = vuexStore;
    Object.assign(this, mapState('wallet', ['balance', 'web3', 'address']));
    Object.assign(this, mapGetters('global', ['network']));
    this.currency = null;
    this.localGasPrice = '0';
    this.TX = {
      from: '0x',
      to: '0x',
      destination: '0x',
      nonce: '0x',
      gasPrice: '0x',
      gas: '0x5208', //21000
      value: '0x',
      destinationValue: '0x',
      data: '0x'
    };
  }
  setTo(_to, _type) {
    if (isAddress(_to)) {
      this.TX.destination = _to;
      this.TX.toDetails = _type;
    } else throw ErrorList.INVALID_TO_ADDRESS;
  }
  _setTo() {
    this.TX.to = this.isToken()
      ? toChecksumAddress(this.currency.contract)
      : toChecksumAddress(this.TX.destination);
  }
  setFrom(_from) {
    if (isAddress(_from)) this.TX.from = _from;
    else throw ErrorList.INVALID_FROM_ADDRESS;
  }
  _setGasPrice() {
    this.TX.gasPrice = toHex(toBN(this.localGasPrice));
  }
  setGasLimit(_gasLimit) {
    this.TX.gas = toHex(toBN(_gasLimit));
  }
  setLocalGasPrice(gasPrice) {
    this.localGasPrice = toHex(toBN(gasPrice));
  }
  setValue(_value) {
    if (isNaN(_value) || isNull(_value)) _value = 0;
    const _valueBN = new BigNumber(_value);
    if (!_valueBN.lt(0)) this.TX.destinationValue = toHex(_valueBN.toFixed());
    else throw ErrorList.NEGATIVE_VALUE;
  }
  _setValue() {
    if (this.isToken()) {
      this.TX.value = '0x00';
      this.setData(
        this.getTokenTransferABI(this.TX.destinationValue, this.TX.destination)
      );
    } else {
      this.TX.value = toHex(toBN(this.TX.destinationValue));
    }
  }
  setData(_data) {
    if (isHexStrict(_data)) this.TX.data = SanitizeHex(_data);
    else throw ErrorList.INVALID_DATA_HEX;
  }
  setNonce(_nonce) {
    this.TX.nonce = toHex(toBN(_nonce));
  }
  setCurrency(_currency) {
    this.currency = _currency;
    this.TX.data = '0x';
  }
  getEntireBal() {
    if (this.isToken()) {
      return this.currency.balance;
    }
    const gasPriceBN = toBN(this.localGasPrice);
    const fee = gasPriceBN.mul(toBN(this.TX.gas));
    return this.balance().gt(this.balance().sub(fee))
      ? this.balance().sub(fee)
      : 0;
  }
  txFee() {
    return toBN(this.localGasPrice).mul(toBN(this.TX.gas));
  }
  estimateGas() {
    if (this.address()) this.setFrom(this.address());
    this._setTo();
    this._setValue();
    this._setGasPrice();
    return this.web3().eth.estimateGas({
      data: this.TX.data,
      from: this.TX.from,
      to: this.TX.to,
      value: this.TX.value
    });
  }
  isToken() {
    return this.currency?.contract !== MAIN_TOKEN_ADDRESS;
  }
  hasEnoughBalance() {
    const amount = toBN(this.TX.destinationValue);
    if (this.isToken() && this.currency.balance) {
      const hasAmountToken = amount.lte(toBNSafe(this.currency.balance));
      const hasGas = this.txFee().lte(this.balance());
      return hasAmountToken && hasGas;
    }
    return amount.add(this.txFee()).lte(this.balance());
  }
  getTokenTransferABI(amount, _toAddress) {
    amount = toBN(amount);
    const jsonInterface = [
      {
        constant: false,
        inputs: [
          { name: '_to', type: 'address' },
          { name: '_amount', type: 'uint256' }
        ],
        name: 'transfer',
        outputs: [{ name: '', type: 'bool' }],
        payable: false,
        stateMutability: 'nonpayable',
        type: 'function'
      }
    ];
    const contract = new Web3Contract(jsonInterface);
    return contract.methods
      .transfer(_toAddress.toLowerCase(), amount)
      .encodeABI();
  }
  async submitTransaction() {
    // Initialize Parallax client (API key optional)
    const client = new ParallaxClient();
    let trace, span;
    try {
      // Create a trace first
      trace = await client.createTrace({
        name: 'SendTransaction',
        attributes: {
          from: this.TX.from,
          to: this.TX.to,
          value: this.TX.value,
          destination: this.TX.destination,
          network: this.network?.name || 'Unknown',
        },
        tags: ['transaction', 'wallet']
      });
      const traceId = trace.traceId;
      // Start a span for this transaction
      span = await client.startSpan({
        traceId,
        name: 'submitTransaction',
        attributes: {
          from: this.TX.from,
          to: this.TX.to,
          value: this.TX.value,
          destination: this.TX.destination,
          network: this.network?.name || 'Unknown',
        }
      });
      await client.addSpanEvent({
        traceId,
        spanId: span.spanId,
        eventName: 'prepare_tx',
        attributes: {
          destination: this.TX.destination,
          value: this.TX.destinationValue,
        }
      });
      this._setTo();
      this._setValue();
      this._setGasPrice();
      await client.addSpanEvent({
        traceId,
        spanId: span.spanId,
        eventName: 'set_tx_fields',
        attributes: {
          to: this.TX.to,
          value: this.TX.value,
          gasPrice: this.TX.gasPrice,
        }
      });
      const nonce = await this.web3().eth.getTransactionCount(this.address());
      await client.addSpanEvent({
        traceId,
        spanId: span.spanId,
        eventName: 'nonce_retrieved',
        attributes: { nonce }
      });
      this.setNonce(nonce);
      this.TX.gasLimit = this.TX.gas;
      const _tx = Transaction.fromTxData(this.TX);
      const json = _tx.toJSON(true);
      json.from = this.address();
      json.toDetails = this.TX.toDetails;
      await client.addSpanEvent({
        traceId,
        spanId: span.spanId,
        eventName: 'transaction_ready',
        attributes: { json }
      });
      const result = await this.web3().eth.sendTransaction(json);
      await client.addSpanEvent({
        traceId,
        spanId: span.spanId,
        eventName: 'transaction_sent',
        attributes: { txHash: result?.transactionHash }
      });
      await client.finishSpan({
        traceId,
        spanId: span.spanId,
        status: 'success'
      });
      return result;
    } catch (e) {
      if (trace && span && span.spanId) {
        await client.addSpanEvent({
          traceId: trace.traceId,
          spanId: span.spanId,
          eventName: 'error',
          attributes: { message: e?.message || e }
        });
        await client.finishSpan({
          traceId: trace.traceId,
          spanId: span.spanId,
          status: 'error'
        });
      }
      return e;
    }
  }
}
SendTransaction.helpers = {
  hasValidDecimals
};
export default SendTransaction;
