import { EventEmitter } from 'node:events';

/**
 * Domain events. The web API emits them after successful changes; integrations
 * (Telegram notifications now, a full Telegram bot later) subscribe here instead
 * of being called directly from business logic.
 */
export type DomainEvents = {
  'cash.closed': {
    closeId: number;
    expected: number;
    counted: number;
    difference: number;
    snackSales: number;
    drinkSales: number;
    cashExpenses: number;
    withdrawals: number;
    deposits: number;
    opening: number;
  };
  'stock.low': { id: number; name: string; standQty: number; warehouseQty: number; lowStockLevel: number }[];
};

class TypedBus {
  private emitter = new EventEmitter();
  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]) {
    this.emitter.emit(event, payload);
  }
  on<K extends keyof DomainEvents>(event: K, handler: (payload: DomainEvents[K]) => void | Promise<void>) {
    this.emitter.on(event, (p) => {
      Promise.resolve(handler(p)).catch((err) => console.error(`[events] ${event} handler failed`, err));
    });
  }
}

export const bus = new TypedBus();
