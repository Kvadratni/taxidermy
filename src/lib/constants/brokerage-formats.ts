import { ColumnMapping } from '@/types';

export interface BrokerageFormat {
  name: string;
  headerSignature: string[];
  mapping: ColumnMapping;
  actionMap?: Record<string, string>;
}

export const BROKERAGE_FORMATS: BrokerageFormat[] = [
  {
    name: 'G&L Report',
    headerSignature: ['Date Sold', 'Total Proceeds', 'Adjusted Cost Basis', 'Quantity'],
    mapping: {
      date: -1,
      quantity: -1,
      glMode: true,
    },
  },
  {
    name: 'Questrade',
    headerSignature: ['Transaction Date', 'Settlement Date', 'Action', 'Symbol', 'Quantity', 'Price', 'Commission'],
    mapping: {
      date: -1,           // resolved dynamically
      settlementDate: -1,
      action: -1,
      symbol: -1,
      quantity: -1,
      price: -1,
      commission: -1,
      currency: -1,
    },
    actionMap: {
      'Buy': 'BUY',
      'Sell': 'SELL',
    },
  },
  {
    name: 'Wealthsimple',
    headerSignature: ['Date', 'Account', 'Type', 'Description', 'Quantity', 'Price', 'Amount'],
    mapping: {
      date: -1,
      action: -1,
      symbol: -1,
      quantity: -1,
      price: -1,
      commission: undefined,
      currency: -1,
    },
    actionMap: {
      'buy': 'BUY',
      'sell': 'SELL',
      'dividend': 'DIVIDEND',
    },
  },
  {
    name: 'Interactive Brokers',
    headerSignature: ['Symbol', 'Date/Time', 'Quantity', 'T. Price', 'Comm/Fee', 'Currency'],
    mapping: {
      date: -1,
      action: -1,
      symbol: -1,
      quantity: -1,
      price: -1,
      commission: -1,
      currency: -1,
    },
  },
];
