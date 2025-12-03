import StakewiseHandler from './stakewiseHandler';
import { toWei } from 'web3-utils';
import hasValidDecimals from '@/core/helpers/hasValidDecimals';
import { MEW_REFERRAL_ADDRESS } from './configs';
import ParallaxService from '@/core/services/ParallaxService';
class StakewiseStakeHandler extends StakewiseHandler {
  constructor(web3, isEth, address) {
    super(web3, isEth); // initializes the contracts needed
    this.fromAddress = address;
    this.value = 0;
    this.gasLimt = '21000';
    this.gasPrice = '0';
    this.web3 = web3;
  }

  getTransactionFee() {
    return (
      this.poolContract.methods
        // eslint-disable-next-line
        .stakeWithReferrerOnBehalf(MEW_REFERRAL_ADDRESS, this.fromAddress)
        .estimateGas({
          from: this.fromAddress,
          value: this.value
        })
    );
  }

  stake() {
    // Track stakewise stake start
    ParallaxService.addSpanEvent('stakewise_stake_start', {
      address: this.fromAddress,
      value: this.value,
      gasLimit: this.gasLimit,
      gasPrice: this.gasPrice
    }).catch(err => {
      console.error('Failed to track stakewise stake start:', err);
    });

    return this.poolContract.methods
      .stakeWithReferrerOnBehalf(MEW_REFERRAL_ADDRESS, this.fromAddress)
      .send({
        from: this.fromAddress,
        value: this.value,
        gas: this.gasLimit,
        gasPrice: this.gasPrice
      })
      .on('transactionHash', txHash => {
        // Track transaction hash
        ParallaxService.addSpanEvent('stakewise_stake_hash', {
          address: this.fromAddress,
          txHash,
          value: this.value
        }).catch(err => {
          console.error('Failed to track stakewise stake hash:', err);
        });
      })
      .on('receipt', receipt => {
        // Track stake success
        ParallaxService.addSpanEvent('stakewise_stake_success', {
          address: this.fromAddress,
          txHash: receipt.transactionHash,
          value: this.value,
          gasUsed: receipt.gasUsed
        }).catch(err => {
          console.error('Failed to track stakewise stake success:', err);
        });
      })
      .on('error', error => {
        // Track stake error
        ParallaxService.addSpanEvent('stakewise_stake_error', {
          address: this.fromAddress,
          error: error?.message || error?.toString(),
          value: this.value
        }).catch(err => {
          console.error('Failed to track stakewise stake error:', err);
        });
      });
  }

  _setAmount(val) {
    this.value = toWei(val);
  }

  _setGasLimit(val) {
    this.gasLimit = val;
  }

  _setGasPrice(val) {
    this.gasPrice = val;
  }
}

StakewiseStakeHandler.helpers = {
  hasValidDecimals
};

export default StakewiseStakeHandler;
