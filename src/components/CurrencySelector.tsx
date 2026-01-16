import React from 'react';
import { CURRENCIES, CurrencyCode } from '../types';

interface CurrencySelectorProps {
  value: CurrencyCode;
  onChange: (value: CurrencyCode) => void;
  label?: string;
  excludeCurrency?: CurrencyCode;
}

export const CurrencySelector: React.FC<CurrencySelectorProps> = ({
  value,
  onChange,
  label,
  excludeCurrency,
}) => {
  const availableCurrencies = CURRENCIES.filter(
    (c) => c.code !== excludeCurrency
  );

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-gray-600">{label}</label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as CurrencyCode)}
        className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-800 font-medium
                   focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                   cursor-pointer transition-all hover:border-primary-400"
      >
        {availableCurrencies.map((currency) => (
          <option key={currency.code} value={currency.code}>
            {currency.flag} {currency.code} - {currency.name}
          </option>
        ))}
      </select>
    </div>
  );
};

interface CurrencyPairSelectorProps {
  from: CurrencyCode;
  to: CurrencyCode;
  onFromChange: (value: CurrencyCode) => void;
  onToChange: (value: CurrencyCode) => void;
  onSwap?: () => void;
}

export const CurrencyPairSelector: React.FC<CurrencyPairSelectorProps> = ({
  from,
  to,
  onFromChange,
  onToChange,
  onSwap,
}) => {
  return (
    <div className="flex items-end gap-2 flex-wrap">
      <CurrencySelector
        value={from}
        onChange={onFromChange}
        label="基准货币"
        excludeCurrency={to}
      />
      
      {onSwap && (
        <button
          onClick={onSwap}
          className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 
                     rounded-lg transition-colors"
          title="交换货币"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
            />
          </svg>
        </button>
      )}
      
      <CurrencySelector
        value={to}
        onChange={onToChange}
        label="目标货币"
        excludeCurrency={from}
      />
    </div>
  );
};

// Multi-currency selector for comparison view
interface MultiCurrencySelectorProps {
  selected: CurrencyCode[];
  onChange: (currencies: CurrencyCode[]) => void;
  excludeCurrency?: CurrencyCode; // Usually the base currency (USD)
  maxSelections?: number;
}

export const MultiCurrencySelector: React.FC<MultiCurrencySelectorProps> = ({
  selected,
  onChange,
  excludeCurrency,
  maxSelections = 9,
}) => {
  const availableCurrencies = CURRENCIES.filter(
    (c) => c.code !== excludeCurrency
  );

  const toggleCurrency = (code: CurrencyCode) => {
    if (selected.includes(code)) {
      // Remove
      onChange(selected.filter((c) => c !== code));
    } else {
      // Add if under max
      if (selected.length < maxSelections) {
        onChange([...selected, code]);
      }
    }
  };

  const selectAll = () => {
    onChange(availableCurrencies.map((c) => c.code));
  };

  const clearAll = () => {
    onChange([]);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-600">
          选择对比货币 ({selected.length}/{availableCurrencies.length})
        </label>
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="text-xs px-2 py-1 text-primary-600 hover:bg-primary-50 rounded"
          >
            全选
          </button>
          <button
            onClick={clearAll}
            className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-100 rounded"
          >
            清空
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {availableCurrencies.map((currency) => {
          const isSelected = selected.includes(currency.code);
          return (
            <button
              key={currency.code}
              onClick={() => toggleCurrency(currency.code)}
              className={`px-3 py-2 rounded-lg border-2 font-medium transition-all
                ${isSelected 
                  ? 'border-primary-500 bg-primary-50 text-primary-700' 
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
            >
              <span className="mr-1">{currency.flag}</span>
              {currency.code}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CurrencySelector;
