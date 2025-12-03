import { ParallaxClient } from '@miradorlabs/parallax';

/**
 * Global Parallax Service - Singleton
 * Manages a persistent trace and span for the entire user session
 * from wallet connection to disconnection
 */
class ParallaxService {
  constructor() {
    this.client = null;
    this.trace = null;
    this.span = null;
    this.traceId = null;
    this.spanId = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the Parallax client and create a session trace
   * Called when user connects their wallet
   */
  async initialize(walletAddress, networkName) {
    if (this.isInitialized) {
      console.warn('ParallaxService already initialized');
      return {
        traceId: this.traceId,
        spanId: this.spanId
      };
    }

    try {
      // Initialize client
      this.client = new ParallaxClient();

      // Create a trace for the entire session
      this.trace = await this.client.createTrace({
        name: 'WalletSession',
        attributes: {
          walletAddress,
          network: networkName,
          sessionStart: new Date().toISOString()
        },
        tags: ['session', 'wallet', networkName]
      });

      this.traceId = this.trace.traceId;

      // Start a main span for the session
      this.span = await this.client.startSpan({
        traceId: this.traceId,
        name: 'UserSession',
        attributes: {
          walletAddress,
          network: networkName,
          type: 'session'
        }
      });

      this.spanId = this.span.spanId;
      this.isInitialized = true;

      console.log('ParallaxService initialized:', {
        traceId: this.traceId,
        spanId: this.spanId
      });

      // Add initial span event
      await this.addSpanEvent('wallet_connected', {
        walletAddress,
        network: networkName,
        timestamp: new Date().toISOString()
      });

      return {
        traceId: this.traceId,
        spanId: this.spanId
      };
    } catch (error) {
      console.error('Failed to initialize ParallaxService:', error);
      throw error;
    }
  }

  /**
   * Add a span event for navigation
   */
  async trackNavigation(routeName, routePath, routeParams = {}) {
    if (!this.isInitialized) {
      console.warn('ParallaxService not initialized. Call initialize() first.');
      return;
    }

    try {
      await this.client.addSpanEvent({
        traceId: this.traceId,
        spanId: this.spanId,
        eventName: 'navigation',
        attributes: {
          routeName,
          routePath,
          params: routeParams,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Failed to track navigation:', error);
    }
  }

  /**
   * Add a span event for blockchain transaction
   */
  async trackTransaction(transactionData) {
    if (!this.isInitialized) {
      console.warn('ParallaxService not initialized. Call initialize() first.');
      return;
    }

    try {
      await this.client.addSpanEvent({
        traceId: this.traceId,
        spanId: this.spanId,
        eventName: 'blockchain_transaction',
        attributes: {
          ...transactionData,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Failed to track transaction:', error);
    }
  }

  /**
   * Add a span event for network switching
   */
  async trackNetworkSwitch(fromNetwork, toNetwork, networkDetails = {}) {
    if (!this.isInitialized) {
      console.warn('ParallaxService not initialized. Call initialize() first.');
      return;
    }

    try {
      await this.client.addSpanEvent({
        traceId: this.traceId,
        spanId: this.spanId,
        eventName: 'network_switch',
        attributes: {
          fromNetwork,
          toNetwork,
          ...networkDetails,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Failed to track network switch:', error);
    }
  }

  /**
   * Add a custom span event
   */
  async addSpanEvent(eventName, attributes = {}) {
    if (!this.isInitialized) {
      console.warn('ParallaxService not initialized. Call initialize() first.');
      return;
    }

    try {
      await this.client.addSpanEvent({
        traceId: this.traceId,
        spanId: this.spanId,
        eventName,
        attributes: {
          ...attributes,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error(`Failed to add span event '${eventName}':`, error);
    }
  }

  /**
   * Finish the span and cleanup
   * Called when user disconnects wallet or signs out
   */
  async finish() {
    if (!this.isInitialized) {
      console.warn('ParallaxService not initialized. Nothing to finish.');
      return;
    }

    try {
      // Add final span event
      await this.addSpanEvent('wallet_disconnected', {
        sessionEnd: new Date().toISOString()
      });

      // Finish the span
      await this.client.finishSpan({
        traceId: this.traceId,
        spanId: this.spanId
      });

      console.log('ParallaxService session finished:', {
        traceId: this.traceId,
        spanId: this.spanId
      });

      // Reset state
      this.trace = null;
      this.span = null;
      this.traceId = null;
      this.spanId = null;
      this.isInitialized = false;
    } catch (error) {
      console.error('Failed to finish ParallaxService:', error);
    }
  }

  /**
   * Get current session info
   */
  getSessionInfo() {
    return {
      isInitialized: this.isInitialized,
      traceId: this.traceId,
      spanId: this.spanId
    };
  }

  /**
   * Get the ParallaxClient instance for advanced usage
   */
  getClient() {
    return this.client;
  }
}

// Export singleton instance
export default new ParallaxService();
