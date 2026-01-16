import React, { useMemo, useRef } from 'react';
import ReactApexChart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import { CurrencyCode, CURRENCIES, BASE_CURRENCY } from '../types';

// Color palette for multiple currencies
const CHART_COLORS = [
  '#2563eb', // blue
  '#dc2626', // red
  '#16a34a', // green
  '#9333ea', // purple
  '#ea580c', // orange
  '#0891b2', // cyan
  '#be185d', // pink
  '#4f46e5', // indigo
  '#ca8a04', // yellow
];

interface CurrencyData {
  currency: CurrencyCode;
  percentageData: { date: string; value: number }[];
}

interface MultiComparisonChartProps {
  currencyDataList: CurrencyData[];
  loading?: boolean;
  error?: string | null;
  height?: number;
}

export const MultiComparisonChart: React.FC<MultiComparisonChartProps> = ({
  currencyDataList,
  loading = false,
  error = null,
  height = 400,
}) => {
  const chartRef = useRef<ReactApexChart>(null);
  
  // 使用稳定的 key 来避免图表重新挂载
  const chartKey = useMemo(() => {
    return currencyDataList.map(cd => cd.currency).sort().join('-');
  }, [currencyDataList]);

  const series = useMemo(() => {
    return currencyDataList
      .filter((cd) => cd.percentageData.length > 0)
      .map((cd) => {
        const currencyInfo = CURRENCIES.find((c) => c.code === cd.currency);
        return {
          name: `${currencyInfo?.flag || ''} ${cd.currency}`,
          data: cd.percentageData.map((d) => ({
            x: new Date(d.date).getTime(),
            y: d.value,
          })),
        };
      });
  }, [currencyDataList]);

  // Generate title
  const titleText = useMemo(() => {
    if (currencyDataList.length === 0) return '货币走势对比';
    const currencies = currencyDataList.map((cd) => {
      const info = CURRENCIES.find((c) => c.code === cd.currency);
      return `${info?.flag || ''} ${cd.currency}`;
    });
    return `${currencies.join(' / ')} 走势对比`;
  }, [currencyDataList]);

  const options: ApexOptions = useMemo(
    () => ({
      chart: {
        type: 'line',
        height,
        zoom: {
          type: 'x',
          enabled: true,
          autoScaleYaxis: true,
        },
        toolbar: {
          autoSelected: 'zoom',
          tools: {
            download: true,
            selection: true,
            zoom: true,
            zoomin: true,
            zoomout: true,
            pan: true,
            reset: true,
          },
        },
        animations: {
          enabled: true,
          easing: 'easeinout',
          speed: 500,
        },
      },
      colors: CHART_COLORS.slice(0, currencyDataList.length),
      dataLabels: {
        enabled: false,
      },
      stroke: {
        curve: 'smooth',
        width: 2,
      },
      xaxis: {
        type: 'datetime',
        labels: {
          datetimeFormatter: {
            year: 'yyyy',
            month: "yyyy'年'MM'月'",
            day: 'MM/dd',
            hour: 'HH:mm',
          },
        },
      },
      yaxis: {
        title: {
          text: '涨跌幅 (%)',
          style: {
            fontSize: '12px',
            fontWeight: 500,
          },
        },
        labels: {
          formatter: (value: number) => `${value.toFixed(2)}%`,
        },
      },
      tooltip: {
        x: {
          format: 'yyyy年MM月dd日',
        },
        y: {
          formatter: (value: number) => `${value.toFixed(2)}%`,
        },
      },
      title: {
        text: titleText,
        align: 'left',
        style: {
          fontSize: '16px',
          fontWeight: 600,
        },
      },
      legend: {
        position: 'top',
        horizontalAlign: 'right',
      },
      annotations: {
        yaxis: [
          {
            y: 0,
            borderColor: '#9ca3af',
            borderWidth: 1,
            strokeDashArray: 4,
          },
        ],
      },
      noData: {
        text: '暂无缓存数据，请点击右上角"刷新数据"按钮获取',
        align: 'center',
        verticalAlign: 'middle',
        style: {
          fontSize: '14px',
        },
      },
    }),
    [currencyDataList.length, height, titleText]
  );

  if (loading) {
    return (
      <div
        className="flex items-center justify-center bg-gray-50 rounded-lg"
        style={{ height }}
      >
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-500">加载中...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex items-center justify-center bg-red-50 rounded-lg"
        style={{ height }}
      >
        <div className="flex flex-col items-center gap-2 text-red-600">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (currencyDataList.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-gray-50 rounded-lg"
        style={{ height }}
      >
        <div className="text-gray-500">请选择至少一种货币进行对比</div>
      </div>
    );
  }

  // Calculate summary stats
  const getLatestChange = (data: { date: string; value: number }[]) => {
    if (data.length === 0) return 0;
    return data[data.length - 1].value;
  };

  return (
    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
      <ReactApexChart
        key={chartKey}
        ref={chartRef}
        options={options}
        series={series}
        type="line"
        height={height}
      />
      
      {/* Summary cards - responsive grid */}
      <div className={`mt-4 grid gap-4 ${
        currencyDataList.length <= 3 
          ? `grid-cols-${currencyDataList.length}` 
          : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
      }`} style={{
        gridTemplateColumns: currencyDataList.length <= 4 
          ? `repeat(${currencyDataList.length}, minmax(0, 1fr))`
          : undefined
      }}>
        {currencyDataList.map((cd, index) => {
          const currencyInfo = CURRENCIES.find((c) => c.code === cd.currency);
          const change = getLatestChange(cd.percentageData);
          const bgColor = CHART_COLORS[index % CHART_COLORS.length];
          
          return (
            <div 
              key={cd.currency} 
              className="rounded-lg p-4"
              style={{ backgroundColor: `${bgColor}15` }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{currencyInfo?.flag}</span>
                <span className="font-semibold text-gray-800">
                  {cd.currency}/{BASE_CURRENCY}
                </span>
              </div>
              <div
                className={`text-2xl font-bold ${
                  change >= 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {change >= 0 ? '+' : ''}
                {change.toFixed(2)}%
              </div>
              <div className="text-sm text-gray-500">期间涨跌幅</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MultiComparisonChart;
