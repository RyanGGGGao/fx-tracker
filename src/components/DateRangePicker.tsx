import React, { useState, useMemo } from 'react';
import dayjs from 'dayjs';
import { TIME_RANGES } from '../types';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onPresetSelect?: (days: number) => void;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onPresetSelect,
}) => {
  const [activePreset, setActivePreset] = useState<number | null>(365);
  const [showCustom, setShowCustom] = useState(false);

  const maxDate = useMemo(() => dayjs().format('YYYY-MM-DD'), []);
  const minDate = useMemo(() => dayjs().subtract(10, 'year').format('YYYY-MM-DD'), []);

  const handlePresetClick = (days: number) => {
    setActivePreset(days);
    setShowCustom(false);
    const newStartDate = dayjs().subtract(days, 'day').format('YYYY-MM-DD');
    const newEndDate = dayjs().format('YYYY-MM-DD');
    onStartDateChange(newStartDate);
    onEndDateChange(newEndDate);
    onPresetSelect?.(days);
  };

  const handleCustomClick = () => {
    setActivePreset(null);
    setShowCustom(!showCustom);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Preset buttons */}
      <div className="flex flex-wrap gap-2">
        {TIME_RANGES.map((range) => (
          <button
            key={range.days}
            onClick={() => handlePresetClick(range.days)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors
              ${
                activePreset === range.days
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
          >
            {range.label}
          </button>
        ))}
        <button
          onClick={handleCustomClick}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors
            ${
              showCustom
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
        >
          自定义
        </button>
      </div>

      {/* Custom date inputs */}
      {showCustom && (
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">开始日期</label>
            <input
              type="date"
              value={startDate}
              min={minDate}
              max={endDate}
              onChange={(e) => {
                onStartDateChange(e.target.value);
                setActivePreset(null);
              }}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <span className="text-gray-400 mt-5">至</span>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">结束日期</label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              max={maxDate}
              onChange={(e) => {
                onEndDateChange(e.target.value);
                setActivePreset(null);
              }}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      )}

      {/* Current range display */}
      <div className="text-sm text-gray-500">
        当前范围：{dayjs(startDate).format('YYYY年M月D日')} 至{' '}
        {dayjs(endDate).format('YYYY年M月D日')}
        <span className="ml-2 text-gray-400">
          ({dayjs(endDate).diff(dayjs(startDate), 'day')} 天)
        </span>
      </div>
    </div>
  );
};

export default DateRangePicker;
