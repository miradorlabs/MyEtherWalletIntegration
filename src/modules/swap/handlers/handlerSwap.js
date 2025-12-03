import { isObject } from 'lodash';
import BigNumber from 'bignumber.js';

import { OneInch, ZEROX, ParaSwap, Changelly } from './providers';
import Configs from './configs/providersConfigs';
import hasValidDecimals from '@/core/helpers/hasValidDecimals.js';
import { ETH, POL, BSC } from '@/utils/networks/types';
import ParallaxService from '@/core/services/ParallaxService';

class Swap {
  constructor(web3, chain) {
    this.providers = [
      new OneInch(web3, chain),
      new ZEROX(web3, chain),
      new ParaSwap(web3, chain),
      new Changelly(web3, chain)
    ];
    this.chain = chain;
  }
  getAllTokens() {
    const allTokens = {};
    const DOGE_ADDRESS = '0x4206931337dc273a630d328dA6441786BfaD668f';
    const initialProvider =
      this.chain === ETH.name ||
      this.chain === POL.name ||
      this.chain === BSC.name
        ? 0
        : 3;
    return this.providers[initialProvider]
      .getSupportedTokens()
      .then(baseList => {
        if (baseList && baseList.length > 0)
          baseList.forEach(t => {
            if (t.contract?.toLowerCase() !== DOGE_ADDRESS.toLowerCase())
              allTokens[t.contract] = t;
          });
        return Promise.all(
          this.providers.slice(3).map(p => {
            if (!p.isSupportedNetwork(this.chain)) return Promise.resolve();
            return p.getSupportedTokens().then(tokens => {
              if (tokens && tokens.length > 0) {
                tokens.forEach(t => {
                  if (
                    t.contract?.toLowerCase() !== DOGE_ADDRESS.toLowerCase() &&
                    !allTokens[t.contract]
                  ) {
                    allTokens[t.contract] = t;
                  }
                });
              }
            });
          })
        ).then(() => {
          const sorted = Object.values(allTokens)
            .filter(t => isObject(t))
            .sort((a, b) => {
              if (a.name > b.name) return 1;
              return -1;
            });
          return {
            fromTokens: sorted?.filter(t => {
              if (!t || !t.contract) return false;
              return t;
            }),
            toTokens: sorted
          };
        });
      });
  }
  getAllQuotes({ fromT, toT, fromAmount }) {
    // Track swap quote request
    ParallaxService.addSpanEvent('swap_quote_request', {
      fromToken: fromT?.symbol || fromT?.contract,
      toToken: toT?.symbol || toT?.contract,
      fromAmount: fromAmount?.toString(),
      chain: this.chain
    }).catch(err => {
      console.error('Failed to track swap quote request:', err);
    });

    let allQuotes = [];
    return Promise.all(
      this.providers.map(p => {
        if (!p.isSupportedNetwork(this.chain)) return Promise.resolve();
        return p.getQuote({ fromT, toT, fromAmount }).then(quotes => {
          if (quotes) allQuotes = allQuotes.concat(quotes);
        });
      })
    ).then(() => {
      allQuotes.sort((q1, q2) => {
        if (new BigNumber(q1.amount).gt(new BigNumber(q2.amount))) return -1;
        return 1;
      });

      // Track quote results
      ParallaxService.addSpanEvent('swap_quotes_received', {
        fromToken: fromT?.symbol || fromT?.contract,
        toToken: toT?.symbol || toT?.contract,
        quotesCount: allQuotes.length,
        bestQuote: allQuotes[0]?.amount?.toString(),
        providers: allQuotes.map(q => q.exchange).join(','),
        chain: this.chain
      }).catch(err => {
        console.error('Failed to track swap quotes received:', err);
      });

      return allQuotes.map(q => {
        if (Configs.exchangeInfo[q.exchange]) {
          q.exchangeInfo = Configs.exchangeInfo[q.exchange];
        } else {
          q.exchangeInfo = Configs.exchangeInfo.default;
          q.exchangeInfo.name = q.exchange;
        }
        return q;
      });
    });
  }
  getQuotesForSet(arr) {
    const quotes = [];
    const provider = this.providers[3];
    for (let i = 0; i < arr.length; i++) {
      quotes.push(provider.getQuote(arr[i]));
    }
    return Promise.all(quotes);
  }
  getTrade(tradeInfo) {
    for (const p of this.providers) {
      if (p.provider === tradeInfo.provider) return p.getTrade(tradeInfo);
    }
  }
  isValidToAddress(addressInfo) {
    for (const p of this.providers) {
      if (p.provider === addressInfo.provider)
        return p.isValidToAddress(addressInfo);
    }
  }
  executeTrade(tradeInfo, confirmInfo) {
    // Track swap execution start
    ParallaxService.addSpanEvent('swap_execute_start', {
      provider: tradeInfo.provider,
      fromToken: tradeInfo.fromT?.symbol || tradeInfo.fromT?.contract,
      toToken: tradeInfo.toT?.symbol || tradeInfo.toT?.contract,
      fromAmount: tradeInfo.fromAmount?.toString(),
      expectedAmount: tradeInfo.amount?.toString(),
      chain: this.chain
    }).catch(err => {
      console.error('Failed to track swap execution start:', err);
    });

    for (const p of this.providers) {
      if (p.provider === tradeInfo.provider) {
        return p.executeTrade(tradeInfo, confirmInfo).then(result => {
          // Track successful swap execution
          ParallaxService.addSpanEvent('swap_execute_success', {
            provider: tradeInfo.provider,
            fromToken: tradeInfo.fromT?.symbol || tradeInfo.fromT?.contract,
            toToken: tradeInfo.toT?.symbol || tradeInfo.toT?.contract,
            txHash: result?.txHash || result?.id,
            chain: this.chain
          }).catch(err => {
            console.error('Failed to track swap execution success:', err);
          });
          return result;
        }).catch(error => {
          // Track swap execution error
          ParallaxService.addSpanEvent('swap_execute_error', {
            provider: tradeInfo.provider,
            fromToken: tradeInfo.fromT?.symbol || tradeInfo.fromT?.contract,
            toToken: tradeInfo.toT?.symbol || tradeInfo.toT?.contract,
            error: error?.message || error?.toString(),
            chain: this.chain
          }).catch(err => {
            console.error('Failed to track swap execution error:', err);
          });
          throw error;
        });
      }
    }
  }
  getMinMaxAmount(tradeInfo) {
    for (const p of this.providers) {
      if (p.provider === tradeInfo.provider)
        return p.getMinMaxAmount(tradeInfo);
    }
  }
  getStatus(statusObj) {
    // Track swap status check
    ParallaxService.addSpanEvent('swap_status_check', {
      provider: statusObj.provider,
      orderId: statusObj.orderId || statusObj.id,
      chain: this.chain
    }).catch(err => {
      console.error('Failed to track swap status check:', err);
    });

    for (const p of this.providers) {
      if (p.provider === statusObj.provider) {
        return p.getStatus(statusObj).then(status => {
          // Track status result
          ParallaxService.addSpanEvent('swap_status_result', {
            provider: statusObj.provider,
            orderId: statusObj.orderId || statusObj.id,
            status: status?.status || status?.state,
            chain: this.chain
          }).catch(err => {
            console.error('Failed to track swap status result:', err);
          });
          return status;
        });
      }
    }
  }
}

Swap.helpers = {
  hasValidDecimals
};

export default Swap;
