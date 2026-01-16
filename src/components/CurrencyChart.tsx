import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import ReactApexChart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import { DailyRate, CurrencyCode, CURRENCIES, ChartType } from '../types';
import { getEventsForCurrencyPair, getEventImpactDirection, CurrencyEvent } from '../data/currencyEvents';

// Aggregate daily data into weekly data
function aggregateToWeekly(dailyData: DailyRate[]): DailyRate[] {
  if (dailyData.length === 0) return [];
  
  const weeklyMap = new Map<string, DailyRate>();
  
  dailyData.forEach((day) => {
    const date = new Date(day.date);
    // Get Monday of the week (ISO week starts on Monday)
    const dayOfWeek = date.getDay();
    const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(date);
    monday.setDate(diff);
    const weekKey = monday.toISOString().split('T')[0];
    
    const existing = weeklyMap.get(weekKey);
    if (existing) {
      // Update existing week
      existing.high = Math.max(existing.high, day.high);
      existing.low = Math.min(existing.low, day.low);
      existing.close = day.close; // Last day's close becomes week's close
    } else {
      // Start new week
      weeklyMap.set(weekKey, {
        date: weekKey,
        open: day.open,
        high: day.high,
        low: day.low,
        close: day.close,
      });
    }
  });
  
  return Array.from(weeklyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// Aggregate daily data into monthly data
function aggregateToMonthly(dailyData: DailyRate[]): DailyRate[] {
  if (dailyData.length === 0) return [];
  
  const monthlyMap = new Map<string, DailyRate>();
  
  dailyData.forEach((day) => {
    const date = new Date(day.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
    
    const existing = monthlyMap.get(monthKey);
    if (existing) {
      existing.high = Math.max(existing.high, day.high);
      existing.low = Math.min(existing.low, day.low);
      existing.close = day.close;
    } else {
      monthlyMap.set(monthKey, {
        date: monthKey,
        open: day.open,
        high: day.high,
        low: day.low,
        close: day.close,
      });
    }
  });
  
  return Array.from(monthlyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// K线周期类型
type CandlestickPeriod = 'hour' | 'day' | 'week' | 'month';

// K线周期配置
const PERIOD_CONFIG = {
  hour: { label: '时K', shortLabel: '时' },
  day: { label: '日K', shortLabel: '日' },
  week: { label: '周K', shortLabel: '周' },
  month: { label: '月K', shortLabel: '月' },
};

// Calculate days between two timestamps
function daysBetween(start: number, end: number): number {
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

// 根据数据范围自动推荐K线周期
function getRecommendedPeriod(rangeDays: number): CandlestickPeriod {
  if (rangeDays < 30) return 'hour';        // < 1月: 时K (目前数据只有日K，显示日K)
  if (rangeDays < 365) return 'day';        // 1月-1年: 日K
  if (rangeDays < 365 * 5) return 'week';   // 1-5年: 周K
  return 'month';                            // >= 5年: 月K
}

interface CurrencyChartProps {
  data: DailyRate[];
  from: CurrencyCode;
  to: CurrencyCode;
  chartType?: ChartType;
  loading?: boolean;
  error?: string | null;
  isSameCurrency?: boolean;
  height?: number;
  showEvents?: boolean;
  onToggleEvents?: (show: boolean) => void;
}

export const CurrencyChart: React.FC<CurrencyChartProps> = ({
  data,
  from,
  to,
  chartType = 'line',
  loading = false,
  error = null,
  isSameCurrency = false,
  height = 400,
  showEvents = false,
  onToggleEvents,
}) => {
  const fromCurrency = CURRENCIES.find((c) => c.code === from);
  const toCurrency = CURRENCIES.find((c) => c.code === to);
  
  // Track current visible range for candlestick
  const [visibleRange, setVisibleRange] = useState<{ min: number; max: number } | null>(null);
  
  // 用户选择的K线周期 (null = 自动)
  const [userSelectedPeriod, setUserSelectedPeriod] = useState<CandlestickPeriod | null>(null);
  const chartRef = useRef<ReactApexChart>(null);
  
  // 使用 state 只用于显示下方的事件详情卡片（不影响图表）
  const [displayedEvent, setDisplayedEvent] = useState<CurrencyEvent | null>(null);
  
  // 追踪鼠标在图表上的X坐标时间戳，用于高亮最近的事件
  const [mouseXTime, setMouseXTime] = useState<number | null>(null);
  
  // 追踪时间轴条上悬停的最近事件
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  
  // 控制重要事件下拉面板的显示
  const [showEventDropdown, setShowEventDropdown] = useState(false);
  const dropdownCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // 事件列表悬停延迟计时器，防止快速切换
  const eventListHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // 记录鼠标上次的clientX位置，用于判断鼠标是否真正移动了
  const lastMouseClientX = useRef<number | null>(null);

  // Reset visible range and user selected period when data changes
  useEffect(() => {
    setVisibleRange(null);
    setUserSelectedPeriod(null);
  }, [data, chartType]);

  // Show message for same currency
  if (isSameCurrency || from === to) {
    return (
      <div
        className="flex items-center justify-center bg-amber-50 rounded-lg border border-amber-200"
        style={{ height }}
      >
        <div className="flex flex-col items-center gap-3 text-amber-600">
          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span className="text-lg font-medium">请选择两种不同的货币</span>
          <span className="text-sm text-amber-500">基准货币和目标货币不能相同</span>
        </div>
      </div>
    );
  }

  // Pre-calculate aggregated data
  const weeklyData = useMemo(() => aggregateToWeekly(data), [data]);
  const monthlyData = useMemo(() => aggregateToMonthly(data), [data]);

  // 计算数据范围天数
  const rangeDays = useMemo(() => {
    if (data.length === 0) return 0;
    
    if (visibleRange) {
      return daysBetween(visibleRange.min, visibleRange.max);
    }
    
    const firstDate = new Date(data[0].date).getTime();
    const lastDate = new Date(data[data.length - 1].date).getTime();
    return daysBetween(firstDate, lastDate);
  }, [data, visibleRange]);

  // 推荐的周期（根据数据范围自动计算）
  const recommendedPeriod = useMemo(() => getRecommendedPeriod(rangeDays), [rangeDays]);

  // 实际使用的周期（用户选择 > 自动推荐）
  const activePeriod = userSelectedPeriod || recommendedPeriod;

  // 根据周期选择显示的数据
  const { displayData, periodLabel } = useMemo(() => {
    if (chartType !== 'candlestick' || data.length === 0) {
      return { displayData: data, periodLabel: '' };
    }

    switch (activePeriod) {
      case 'hour':
        // 目前只有日数据，时K显示为日K（实际需要小时级数据源）
        return { displayData: data, periodLabel: PERIOD_CONFIG.day.label };
      case 'day':
        return { displayData: data, periodLabel: PERIOD_CONFIG.day.label };
      case 'week':
        return { displayData: weeklyData, periodLabel: PERIOD_CONFIG.week.label };
      case 'month':
        return { displayData: monthlyData, periodLabel: PERIOD_CONFIG.month.label };
      default:
        return { displayData: data, periodLabel: PERIOD_CONFIG.day.label };
    }
  }, [data, weeklyData, monthlyData, chartType, activePeriod]);

  // Line chart series (always uses daily data for smoothness)
  const lineSeries = useMemo(() => {
    if (data.length === 0) return [];
    return [
      {
        name: `${from}/${to}`,
        data: data.map((d) => ({
          x: new Date(d.date).getTime(),
          y: d.close,
        })),
      },
    ];
  }, [data, from, to]);

  // Candlestick series (uses daily or weekly or monthly based on range)
  // Use index as x for numeric axis to avoid gaps on non-trading days
  const candlestickSeries = useMemo(() => {
    if (displayData.length === 0) return [];
    return [
      {
        name: `${from}/${to}`,
        data: displayData.map((d, index) => ({
          x: index, // Use index for numeric axis - no gaps between candles
          y: [d.open, d.high, d.low, d.close],
        })),
      },
    ];
  }, [displayData, from, to]);

  // Handle zoom event - for numeric axis, min/max are indices
  const handleZoomed = useCallback((_chartContext: any, { xaxis }: any) => {
    if (xaxis && xaxis.min !== undefined && xaxis.max !== undefined) {
      // Convert indices to timestamps for period switching logic
      const minIdx = Math.max(0, Math.floor(xaxis.min));
      const maxIdx = Math.min(displayData.length - 1, Math.ceil(xaxis.max));
      if (displayData.length > 0 && minIdx < displayData.length && maxIdx < displayData.length) {
        const minDate = new Date(displayData[minIdx].date).getTime();
        const maxDate = new Date(displayData[maxIdx].date).getTime();
        setVisibleRange({ min: minDate, max: maxDate });
      }
    }
  }, [displayData]);

  // Handle reset zoom (beforeResetZoom)
  const handleBeforeResetZoom = useCallback(() => {
    setVisibleRange(null);
    return undefined;
  }, []);

  // Get events for current currency pair
  // 根据时间范围动态过滤事件数量：范围大时只显示最重要的，范围小时显示更多
  const currencyEvents = useMemo(() => {
    if (!showEvents || data.length === 0) return [];
    const startDate = data[0]?.date;
    const endDate = data[data.length - 1]?.date;
    const allEvents = getEventsForCurrencyPair(from, to, startDate, endDate);
    
    // 计算日期范围（天数）
    const rangeDays = data.length;
    
    // 根据范围大小过滤事件
    // > 5年: 只显示最重要的事件，且间隔至少60天
    // 2-5年: 显示高重要性事件，间隔至少30天
    // 1-2年: 显示高重要性事件
    // < 1年: 显示所有事件
    if (rangeDays > 365 * 5) {
      // 只保留最重要的，且确保间隔
      const filtered: typeof allEvents = [];
      let lastDate = '';
      allEvents.filter(e => e.importance === 'high').forEach(event => {
        if (!lastDate || daysBetween(new Date(lastDate).getTime(), new Date(event.date).getTime()) >= 60) {
          filtered.push(event);
          lastDate = event.date;
        }
      });
      return filtered;
    } else if (rangeDays > 365 * 2) {
      // 高重要性，间隔30天
      const filtered: typeof allEvents = [];
      let lastDate = '';
      allEvents.filter(e => e.importance === 'high').forEach(event => {
        if (!lastDate || daysBetween(new Date(lastDate).getTime(), new Date(event.date).getTime()) >= 30) {
          filtered.push(event);
          lastDate = event.date;
        }
      });
      return filtered;
    } else if (rangeDays > 365) {
      return allEvents.filter(e => e.importance === 'high');
    }
    return allEvents;
  }, [from, to, data, showEvents]);

  // 计算所有事件中内容最长的事件所需的面板高度
  const maxEventPanelHeight = useMemo(() => {
    if (!showEvents || currencyEvents.length === 0) return height + 56;
    
    // 估算每个事件的内容高度
    // 基础高度：顶部accent(6) + header区域(约130) + 分隔线(16) + footer(52) + 外层padding(16)
    const baseHeight = 220;
    
    // 面板内容宽度约为 320 - 40(padding) = 280px
    // 中文字符约 14px 宽度，每行约 14-16 个中文字符
    const charsPerLine = 14;
    const lineHeight = 22; // 行高
    
    // 计算每个事件的内容区域高度
    const eventHeights = currencyEvents.map(event => {
      let contentHeight = 0;
      
      // 简要描述卡片：padding(32) + 文字高度
      const descLines = Math.ceil((event.description?.length || 0) / charsPerLine);
      contentHeight += 40 + descLines * lineHeight;
      
      // 事件背景：如果存在，标题行(32) + 文字高度 + margin(16)
      if (event.background) {
        const bgLines = Math.ceil(event.background.length / charsPerLine);
        contentHeight += 32 + bgLines * lineHeight + 16;
      }
      
      // 市场反应：如果存在
      if (event.marketReaction) {
        const mrLines = Math.ceil(event.marketReaction.length / charsPerLine);
        contentHeight += 32 + mrLines * lineHeight + 16;
      }
      
      // 汇率影响：如果存在
      if (event.rateImpact) {
        const riLines = Math.ceil(event.rateImpact.length / charsPerLine);
        contentHeight += 32 + riLines * lineHeight + 16;
      }
      
      return baseHeight + contentHeight;
    });
    
    // 取最大高度，不设上限，确保能完整显示
    const maxContentHeight = Math.max(...eventHeights);
    const minHeight = 350;
    
    return Math.max(maxContentHeight, minHeight);
  }, [showEvents, currencyEvents, height]);

  // 计算事件在图表上的位置信息
  const eventPositions = useMemo(() => {
    if (!showEvents || currencyEvents.length === 0 || data.length === 0) return [];
    
    const highEvents = currencyEvents.filter(e => e.importance === 'high');
    const positions: Array<{
      event: CurrencyEvent;
      time: number;
      dataPoint: typeof data[0] | null;
    }> = [];
    
    highEvents.forEach((event) => {
      const eventTime = new Date(event.date).getTime();
      
      // Find the data point closest to this event (within 3 days tolerance)
      let closestPoint: typeof data[0] | null = null;
      let minDiff = Infinity;
      
      for (const d of data) {
        const dataTime = new Date(d.date).getTime();
        const diff = Math.abs(dataTime - eventTime);
        if (diff < minDiff && diff <= 3 * 24 * 60 * 60 * 1000) {
          minDiff = diff;
          closestPoint = d;
        }
      }
      
      if (closestPoint) {
        positions.push({
          event,
          time: new Date(closestPoint.date).getTime(),
          dataPoint: closestPoint,
        });
      }
    });
    
    return positions;
  }, [showEvents, currencyEvents, data]);

  // Generate line chart annotations for events - point markers with labels
  const lineEventAnnotations = useMemo(() => {
    if (!showEvents || eventPositions.length === 0) return { xaxis: [], points: [] };
    
    const points: any[] = [];
    const xaxis: any[] = [];
    
    // 按时间排序，用于计算标签偏移避免重叠
    const sortedPositions = [...eventPositions].sort((a, b) => a.time - b.time);
    
    sortedPositions.forEach(({ event, time, dataPoint }, index) => {
      const impact = getEventImpactDirection(event, from, to);
      const bgColor = impact === 'up' ? '#22c55e' : impact === 'down' ? '#ef4444' : '#f59e0b';
      
      // 直接使用 hoveredEventId 判断是否高亮，与时间轴逻辑完全同步
      const isHighlighted = hoveredEventId === event.id;
      let opacity = 0.8;
      
      // 如果有任何悬停状态但不是当前事件，降低透明度
      if (hoveredEventId !== null && !isHighlighted) {
        opacity = 0.3;
      }
      
      const shortTitle = event.title.length > 8 ? event.title.slice(0, 8) + '..' : event.title;
      
      // 显示条件：高亮的事件 或 没有任何悬停状态时显示所有事件
      if (dataPoint && (isHighlighted || hoveredEventId === null)) {
        // 交替上下偏移避免重叠
        const offsetY = (index % 3) * 18 + 5;
        
        points.push({
          x: time,
          y: dataPoint.close,
          marker: {
            size: isHighlighted ? 10 : 7,
            fillColor: bgColor,
            strokeColor: '#fff',
            strokeWidth: 2,
            shape: 'circle',
            opacity: opacity,
          },
          label: {
            borderColor: 'transparent',
            offsetY: -offsetY,
            style: {
              color: '#fff',
              background: bgColor,
              fontSize: isHighlighted ? '11px' : '10px',
              fontWeight: isHighlighted ? 600 : 400,
              padding: {
                left: 4,
                right: 4,
                top: 2,
                bottom: 2,
              },
            },
            text: shortTitle,
            textAnchor: 'middle',
          },
        });
        
        // 当事件被高亮时，添加影响区域的背景高亮
        if (isHighlighted) {
          // 找到下一个事件的时间，或者数据的最后时间
          const nextEventTime = index < sortedPositions.length - 1 
            ? sortedPositions[index + 1].time 
            : new Date(data[data.length - 1].date).getTime();
          
          xaxis.push({
            x: time,
            x2: nextEventTime,
            fillColor: bgColor,
            opacity: 0.08,
            borderColor: bgColor,
            borderWidth: 0,
            label: {
              text: '',
            },
          });
        }
      }
    });
    
    return { xaxis, points };
  }, [showEvents, eventPositions, from, to, hoveredEventId, data]);

  // 计算蜡烛图事件位置信息
  const candlestickEventPositions = useMemo(() => {
    if (!showEvents || currencyEvents.length === 0 || displayData.length === 0) return [];
    
    const highEvents = currencyEvents.filter(e => e.importance === 'high');
    const positions: Array<{
      event: CurrencyEvent;
      time: number;
      date: string;
      dataPoint: typeof displayData[0] | null;
    }> = [];
    
    const toleranceDays = activePeriod === 'month' ? 31 : activePeriod === 'week' ? 7 : 3;
    
    highEvents.forEach((event) => {
      const eventTime = new Date(event.date).getTime();
      
      let closestPoint: typeof displayData[0] | null = null;
      let minDiff = Infinity;
      
      for (const d of displayData) {
        const dataTime = new Date(d.date).getTime();
        const diff = Math.abs(dataTime - eventTime);
        if (diff < minDiff && diff <= toleranceDays * 24 * 60 * 60 * 1000) {
          minDiff = diff;
          closestPoint = d;
        }
      }
      
      if (closestPoint) {
        positions.push({
          event,
          time: new Date(closestPoint.date).getTime(),
          date: closestPoint.date,
          dataPoint: closestPoint,
        });
      }
    });
    
    return positions;
  }, [showEvents, currencyEvents, displayData, activePeriod]);

  // Generate candlestick chart annotations - point markers with labels
  const candlestickEventAnnotations = useMemo(() => {
    if (!showEvents || candlestickEventPositions.length === 0) {
      return { xaxis: [], points: [] };
    }
    
    const points: any[] = [];
    const xaxis: any[] = [];
    
    // 按时间排序
    const sortedPositions = [...candlestickEventPositions].sort((a, b) => a.time - b.time);
    
    sortedPositions.forEach(({ event, date, dataPoint }, index) => {
      const impact = getEventImpactDirection(event, from, to);
      const bgColor = impact === 'up' ? '#22c55e' : impact === 'down' ? '#ef4444' : '#f59e0b';
      
      // 直接使用 hoveredEventId 判断是否高亮，与时间轴逻辑完全同步
      const isHighlighted = hoveredEventId === event.id;
      let opacity = 0.8;
      
      // 如果有任何悬停状态但不是当前事件，降低透明度
      if (hoveredEventId !== null && !isHighlighted) {
        opacity = 0.3;
      }
      
      const shortTitle = event.title.length > 8 ? event.title.slice(0, 8) + '..' : event.title;
      
      // 显示条件：高亮的事件 或 没有任何悬停状态时显示所有事件
      if (dataPoint && (isHighlighted || hoveredEventId === null)) {
        // 交替上下偏移避免重叠
        const offsetY = (index % 3) * 18 + 5;
        
        points.push({
          x: date,
          y: dataPoint.high * 1.002,
          marker: {
            size: isHighlighted ? 10 : 7,
            fillColor: bgColor,
            strokeColor: '#fff',
            strokeWidth: 2,
            shape: 'circle',
            opacity: opacity,
          },
          label: {
            borderColor: 'transparent',
            offsetY: -offsetY,
            style: {
              color: '#fff',
              background: bgColor,
              fontSize: isHighlighted ? '11px' : '10px',
              fontWeight: isHighlighted ? 600 : 400,
              padding: {
                left: 4,
                right: 4,
                top: 2,
                bottom: 2,
              },
            },
            text: shortTitle,
            textAnchor: 'middle',
          },
        });
        
        // 当事件被高亮时，添加影响区域的背景高亮
        if (isHighlighted) {
          // 找到下一个事件的日期，或者数据的最后日期
          const nextEventDate = index < sortedPositions.length - 1 
            ? sortedPositions[index + 1].date 
            : displayData[displayData.length - 1].date;
          
          xaxis.push({
            x: date,
            x2: nextEventDate,
            fillColor: bgColor,
            opacity: 0.08,
            borderColor: bgColor,
            borderWidth: 0,
            label: {
              text: '',
            },
          });
        }
      }
    });
    
    return { xaxis, points };
  }, [showEvents, candlestickEventPositions, from, to, hoveredEventId, displayData]);

  // 动态更新 annotations，避免整个图表刷新
  useEffect(() => {
    if (!chartRef.current || !showEvents) return;
    
    const chart = (chartRef.current as any).chart;
    if (!chart) return;
    
    const isLineChart = chartType === 'line';
    const annotations = isLineChart ? lineEventAnnotations : candlestickEventAnnotations;
    
    // 使用 updateOptions 只更新 annotations
    chart.updateOptions({
      annotations: {
        xaxis: annotations.xaxis,
        points: annotations.points,
      }
    }, false, false); // redrawPaths=false, animate=false 避免闪烁
  }, [hoveredEventId, mouseXTime, lineEventAnnotations, candlestickEventAnnotations, showEvents, chartType]);

  const lineOptions: ApexOptions = useMemo(
    () => ({
      chart: {
        type: 'area',
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
      colors: ['#2563eb'],
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.5,
          opacityTo: 0.1,
          stops: [0, 90, 100],
        },
      },
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
        tooltip: {
          enabled: true,
        },
      },
      yaxis: {
        title: {
          text: `汇率 (${from}/${to})`,
          style: {
            fontSize: '12px',
            fontWeight: 500,
          },
        },
        labels: {
          formatter: (value: number) => value.toFixed(4),
        },
      },
      tooltip: {
        x: {
          format: 'yyyy年MM月dd日',
        },
        y: {
          formatter: (value: number) => value.toFixed(6),
        },
      },
      title: {
        text: `${fromCurrency?.flag} ${from} / ${toCurrency?.flag} ${to} 汇率走势`,
        align: 'left',
        style: {
          fontSize: '16px',
          fontWeight: 600,
        },
      },
      noData: {
        text: '暂无缓存数据，请点击"手动刷新"按钮获取',
        align: 'center',
        verticalAlign: 'middle',
        style: {
          fontSize: '14px',
        },
      },
      annotations: showEvents ? {
        xaxis: lineEventAnnotations.xaxis,
        points: lineEventAnnotations.points,
      } : undefined,
    }),
    [from, to, fromCurrency, toCurrency, height, showEvents, lineEventAnnotations]
  );

  const candlestickOptions: ApexOptions = useMemo(
    () => ({
      chart: {
        type: 'candlestick',
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
          enabled: false, // Disable for performance with large datasets
        },
        events: {
          zoomed: handleZoomed,
          beforeResetZoom: handleBeforeResetZoom,
        },
      },
      xaxis: {
        type: 'numeric',
        tickPlacement: 'on',
        labels: {
          rotate: -45,
          rotateAlways: false,
          hideOverlappingLabels: true,
          formatter: function(val: string) {
            // val is the index, get the date from displayData
            const index = Math.round(parseFloat(val));
            if (index < 0 || index >= displayData.length) return '';
            const dateStr = displayData[index]?.date;
            if (!dateStr) return '';
            
            const parts = dateStr.split('-');
            if (parts.length === 3) {
              const year = parts[0];
              const month = parseInt(parts[1]);
              const day = parseInt(parts[2]);
              if (activePeriod === 'month') {
                return `${year.slice(2)}/${month}`;
              }
              if (activePeriod === 'week') {
                return `${year.slice(2)}/${month}/${day}`;
              }
              return `${month}/${day}`;
            }
            return dateStr;
          },
        },
        crosshairs: {
          show: true,
          width: 1,
          position: 'back',
          opacity: 0.9,
          stroke: {
            color: '#b6b6b6',
            width: 1,
            dashArray: 3,
          },
        },
        tooltip: {
          enabled: true,
          formatter: function(val: string) {
            const index = Math.round(parseFloat(val));
            if (index < 0 || index >= displayData.length) return '';
            const dateStr = displayData[index]?.date;
            if (!dateStr) return '';
            
            const parts = dateStr.split('-');
            if (parts.length === 3) {
              const year = parts[0];
              const month = parseInt(parts[1]);
              const day = parseInt(parts[2]);
              if (activePeriod === 'month') {
                return `${year}年${month}月`;
              }
              return `${year}年${month}月${day}日`;
            }
            return dateStr;
          },
        },
      },
      yaxis: {
        title: {
          text: `汇率 (${from}/${to})`,
          style: {
            fontSize: '12px',
            fontWeight: 500,
          },
        },
        labels: {
          formatter: (value: number) => value.toFixed(4),
        },
        tooltip: {
          enabled: true,
        },
      },
      plotOptions: {
        candlestick: {
          colors: {
            upward: '#16a34a',
            downward: '#dc2626',
          },
          wick: {
            useFillColor: true,
          },
        },
      },
      fill: {
        opacity: 1, // 确保实心填充，不透明
      },
      stroke: {
        width: 1, // 细边框
        colors: ['#16a34a', '#dc2626'], // 边框颜色与填充色相同
      },
      tooltip: {
        enabled: true,
        shared: false,
        intersect: false,
        followCursor: true,
        custom: function({ dataPointIndex }) {
          const dataPoint = displayData[dataPointIndex];
          if (!dataPoint) return '';
          
          const o = dataPoint.open;
          const h = dataPoint.high;
          const l = dataPoint.low;
          const c = dataPoint.close;
          const dateStr = dataPoint.date;
          
          // 解析日期
          let formattedDate = dateStr;
          const parts = dateStr.split('-');
          if (parts.length === 3) {
            const year = parts[0];
            const month = parseInt(parts[1]);
            const day = parseInt(parts[2]);
            formattedDate = `${year}年${month}月${day}日`;
            if (activePeriod === 'month') {
              formattedDate = `${year}年${month}月`;
            }
          }
          
          const change = ((c - o) / o * 100).toFixed(2);
          const changeColor = c >= o ? '#16a34a' : '#dc2626';
          const periodText = activePeriod === 'month' ? '(月)' : activePeriod === 'week' ? '(周)' : '';
          
          return `
            <div class="p-3 bg-white shadow-lg rounded-lg border">
              <div class="font-medium mb-2">${formattedDate} ${periodText}</div>
              <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <span class="text-gray-500">开盘:</span>
                <span class="font-mono">${o.toFixed(6)}</span>
                <span class="text-gray-500">最高:</span>
                <span class="font-mono text-green-600">${h.toFixed(6)}</span>
                <span class="text-gray-500">最低:</span>
                <span class="font-mono text-red-600">${l.toFixed(6)}</span>
                <span class="text-gray-500">收盘:</span>
                <span class="font-mono">${c.toFixed(6)}</span>
                <span class="text-gray-500">涨跌:</span>
                <span class="font-mono" style="color: ${changeColor}">${change}%</span>
              </div>
            </div>
          `;
        },
      },
      title: {
        text: `${fromCurrency?.flag} ${from} / ${toCurrency?.flag} ${to} K线图（${periodLabel}）`,
        align: 'left',
        style: {
          fontSize: '16px',
          fontWeight: 600,
        },
      },
      noData: {
        text: '暂无缓存数据，请点击"手动刷新"按钮获取',
        align: 'center',
        verticalAlign: 'middle',
        style: {
          fontSize: '14px',
        },
      },
      annotations: showEvents ? {
        xaxis: candlestickEventAnnotations.xaxis,
        points: candlestickEventAnnotations.points,
      } : undefined,
    }),
    [from, to, fromCurrency, toCurrency, height, periodLabel, activePeriod, displayData, handleZoomed, handleBeforeResetZoom, showEvents, candlestickEventAnnotations]
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

  const isLine = chartType === 'line';

  return (
    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
      {/* Header with period selector, stats and event toggle */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Period selector for candlestick */}
          {chartType === 'candlestick' && data.length > 0 && (
            <div className="flex items-center gap-1">
              {(['day', 'week', 'month'] as const).map((period) => {
                const isActive = activePeriod === period;
                const isRecommended = recommendedPeriod === period && !userSelectedPeriod;
                return (
                  <button
                    key={period}
                    onClick={() => setUserSelectedPeriod(isActive && userSelectedPeriod ? null : period)}
                    className={`px-2 py-1 text-xs rounded transition-all ${
                      isActive
                        ? 'bg-blue-600 text-white font-medium'
                        : isRecommended
                        ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    title={isRecommended && !userSelectedPeriod ? '自动推荐' : `切换到${PERIOD_CONFIG[period].label}`}
                  >
                    {PERIOD_CONFIG[period].label}
                    {isRecommended && !userSelectedPeriod && (
                      <span className="ml-0.5 text-[10px] opacity-75">•</span>
                    )}
                  </button>
                );
              })}
              {userSelectedPeriod && (
                <button
                  onClick={() => setUserSelectedPeriod(null)}
                  className="px-1.5 py-1 text-xs text-gray-500 hover:text-gray-700"
                  title="恢复自动选择"
                >
                  ↺
                </button>
              )}
            </div>
          )}
          
          {/* Stats inline - 汇率统计信息 */}
          {data.length > 0 && (
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <span className="text-gray-500">最新</span>
                <span className="font-semibold text-gray-800">{data[data.length - 1].close.toFixed(4)}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-gray-500">最高</span>
                <span className="font-semibold text-green-600">{Math.max(...data.map((d) => d.high)).toFixed(4)}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-gray-500">最低</span>
                <span className="font-semibold text-red-600">{Math.min(...data.map((d) => d.low)).toFixed(4)}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-gray-500">涨跌</span>
                <span className={`font-semibold ${
                  data[data.length - 1].close >= data[0].close ? 'text-green-600' : 'text-red-600'
                }`}>
                  {(((data[data.length - 1].close - data[0].close) / data[0].close) * 100).toFixed(2)}%
                </span>
              </div>
            </div>
          )}
        </div>
        
        {/* Event toggle button with hover dropdown */}
        {data.length > 0 && onToggleEvents && (
          <div 
            className="relative"
            onMouseEnter={() => {
              // 取消延迟关闭
              if (dropdownCloseTimer.current) {
                clearTimeout(dropdownCloseTimer.current);
                dropdownCloseTimer.current = null;
              }
              setShowEventDropdown(true);
            }}
            onMouseLeave={() => {
              // 延迟关闭，给用户时间移动到下拉菜单
              dropdownCloseTimer.current = setTimeout(() => {
                setShowEventDropdown(false);
                // 离开下拉面板时清除悬停状态
                setHoveredEventId(null);
                setMouseXTime(null);
                setDisplayedEvent(null);
              }, 150);
            }}
          >
            <button
              onClick={() => onToggleEvents(!showEvents)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                showEvents
                  ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <svg 
                className="w-4 h-4" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
                />
              </svg>
              <span>重要事件</span>
              {showEvents && currencyEvents.length > 0 && (
                <span className="px-1.5 py-0.5 bg-amber-200 rounded-full text-xs">
                  {currencyEvents.length}
                </span>
              )}
            </button>
            
            {/* Hover dropdown for quick event preview */}
            {showEvents && currencyEvents.length > 0 && showEventDropdown && (
              <div className="absolute right-0 top-full mt-1 w-80 max-h-96 overflow-y-auto bg-white rounded-lg shadow-xl border border-gray-200 z-50">
                <div className="p-2 border-b border-gray-100 bg-gray-50 sticky top-0">
                  <span className="text-xs text-gray-500">悬停查看事件详情（共{currencyEvents.length}个）</span>
                </div>
                <div className="p-2 space-y-1 max-h-80 overflow-y-auto">
                  {[...currencyEvents].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((event) => {
                    const impact = getEventImpactDirection(event, from, to);
                    const dotColor = impact === 'up' ? 'bg-green-500' : impact === 'down' ? 'bg-red-500' : 'bg-amber-500';
                    const isHovered = hoveredEventId === event.id;
                    const isDisplayed = displayedEvent?.id === event.id;
                    
                    return (
                      <div
                        key={event.id}
                        className={`p-2 rounded cursor-pointer transition-all duration-150 ${
                          isHovered || isDisplayed
                            ? 'bg-amber-100 scale-[1.02]'
                            : 'hover:bg-gray-100'
                        }`}
                        onMouseEnter={() => {
                          setHoveredEventId(event.id);
                          setDisplayedEvent(event);
                          // 找到该事件在图表上的位置
                          const positions = isLine ? eventPositions : candlestickEventPositions;
                          const pos = positions.find(p => p.event.id === event.id);
                          if (pos) {
                            setMouseXTime(pos.time);
                          } else {
                            setMouseXTime(new Date(event.date).getTime());
                          }
                        }}
                        onClick={() => setDisplayedEvent(isDisplayed ? null : event)}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`flex-shrink-0 w-2 h-2 rounded-full ${dotColor} mt-1`}></span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 text-xs text-gray-400">
                              <span>{event.date}</span>
                              {event.importance === 'high' && (
                                <span className="px-1 bg-red-100 text-red-600 rounded text-[10px]">重要</span>
                              )}
                            </div>
                            <div className="text-sm font-medium text-gray-800 truncate">{event.title}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Main content area - chart + detail panel */}
      {/* 整个区域作为一个整体处理鼠标离开，避免详情面板展开时的跳变问题 */}
      <div 
        className="flex overflow-hidden"
        onMouseLeave={() => {
          // 只有当鼠标离开整个区域（图表+详情面板）时才清除状态
          setMouseXTime(null);
          setHoveredEventId(null);
          setDisplayedEvent(null);
        }}
      >
        {/* Chart and timeline section - smoothly shrinks when detail panel opens */}
        <div 
          className="transition-all duration-500 ease-out"
          style={{ 
            width: displayedEvent && showEvents ? 'calc(100% - 340px)' : '100%',
            flexShrink: 0,
          }}
        >
          <ReactApexChart
            key={`${chartType}-${from}-${to}-${displayData.length}-${showEvents}`}
            ref={chartRef}
            options={isLine ? lineOptions : candlestickOptions}
            series={isLine ? lineSeries : candlestickSeries}
            type={isLine ? 'area' : 'candlestick'}
            height={height}
            onMouseEnter={() => {
              // 鼠标进入走势图时，清除悬停状态，收回详情面板
              setMouseXTime(null);
              setHoveredEventId(null);
              setDisplayedEvent(null);
            }}
          />
      
      {/* Event timeline bar - shown below chart */}
      {/* 左侧padding 60px 对齐走势图的y轴，右侧padding 15px 对齐右边界 */}
      {showEvents && currencyEvents.length > 0 && data.length > 0 && (
        <div 
          className="relative mt-1 group"
          style={{ marginLeft: '60px', marginRight: '15px' }}
        >
          {/* Timeline container with gradient background */}
          <div 
            className="relative h-14 rounded-xl overflow-hidden cursor-crosshair"
            style={{
              background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%)',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
            }}
            onMouseMove={(e) => {
              const clientX = e.clientX;
              const rect = e.currentTarget.getBoundingClientRect();
              const x = clientX - rect.left;
              const percent = x / rect.width;
              const startTime = new Date(data[0].date).getTime();
              const endTime = new Date(data[data.length - 1].date).getTime();
              const time = startTime + (endTime - startTime) * percent;
              setMouseXTime(time);
              
              // 找到最近的事件
              const positions = isLine ? eventPositions : candlestickEventPositions;
              if (positions.length > 0) {
                const sortedByDistance = [...positions].sort((a, b) => 
                  Math.abs(time - a.time) - Math.abs(time - b.time)
                );
                const nearest = sortedByDistance[0];
                
                const isFirstEntry = lastMouseClientX.current === null;
                const mouseReallyMoved = isFirstEntry || Math.abs(clientX - (lastMouseClientX.current ?? clientX)) > 2;
                
                if (displayedEvent) {
                  if (mouseReallyMoved && nearest.event.id !== displayedEvent.id) {
                    setHoveredEventId(nearest.event.id);
                    setDisplayedEvent(nearest.event);
                    lastMouseClientX.current = clientX;
                  } else if (!mouseReallyMoved) {
                    setHoveredEventId(displayedEvent.id);
                  } else {
                    lastMouseClientX.current = clientX;
                  }
                } else {
                  setHoveredEventId(nearest.event.id);
                  setDisplayedEvent(nearest.event);
                  lastMouseClientX.current = clientX;
                }
              }
            }}
            onMouseLeave={() => {
              lastMouseClientX.current = null;
            }}
          >
            {/* Decorative timeline line */}
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-gray-300 via-gray-400 to-gray-300 -translate-y-1/2" />
            
            {/* Year markers - subtle background indicators */}
            <div className="absolute inset-0 flex items-end justify-between px-3 pb-1 text-[10px] text-gray-400 font-medium">
              <span>{data[0]?.date.slice(0, 4)}</span>
              <span>{data[data.length - 1]?.date.slice(0, 4)}</span>
            </div>
            
            {/* Hover hint - fades out when interacting */}
            <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${
              hoveredEventId ? 'opacity-0' : 'opacity-100 group-hover:opacity-0'
            }`}>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/80 backdrop-blur-sm rounded-full shadow-sm border border-gray-200/50">
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" style={{ animationDelay: '0.3s' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" style={{ animationDelay: '0.6s' }} />
                </div>
                <span className="text-xs text-gray-500">滑动查看 {(isLine ? eventPositions : candlestickEventPositions).length} 个重要事件</span>
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </div>
            </div>
            
            {/* Event markers - fancy pill style */}
            {(isLine ? eventPositions : candlestickEventPositions).map(({ event, time }) => {
              const startTime = new Date(data[0].date).getTime();
              const endTime = new Date(data[data.length - 1].date).getTime();
              const percent = ((time - startTime) / (endTime - startTime)) * 100;
              
              if (percent < 0 || percent > 100) return null;
              
              const impact = getEventImpactDirection(event, from, to);
              const isHighlighted = hoveredEventId === event.id;
              const hasAnyHover = hoveredEventId !== null;
              
              // Color schemes
              const colors = {
                up: { bg: '#22c55e', glow: 'rgba(34, 197, 94, 0.4)', ring: 'rgba(34, 197, 94, 0.2)' },
                down: { bg: '#ef4444', glow: 'rgba(239, 68, 68, 0.4)', ring: 'rgba(239, 68, 68, 0.2)' },
                neutral: { bg: '#f59e0b', glow: 'rgba(245, 158, 11, 0.4)', ring: 'rgba(245, 158, 11, 0.2)' },
              };
              const color = colors[impact] || colors.neutral;
              
              return (
                <div
                  key={event.id}
                  className="absolute top-1/2 -translate-y-1/2 transition-all duration-200 ease-out"
                  style={{ 
                    left: `${percent}%`,
                    zIndex: isHighlighted ? 20 : 10,
                  }}
                  onClick={() => setDisplayedEvent(displayedEvent?.id === event.id ? null : event)}
                >
                  {/* Glow effect for highlighted */}
                  {isHighlighted && (
                    <div 
                      className="absolute inset-0 rounded-full animate-ping"
                      style={{ 
                        backgroundColor: color.glow,
                        width: '16px',
                        height: '16px',
                        marginLeft: '-8px',
                        marginTop: '-8px',
                        top: '50%',
                        left: '50%',
                      }}
                    />
                  )}
                  {/* Main marker */}
                  <div
                    className="relative cursor-pointer transition-all duration-200"
                    style={{
                      width: isHighlighted ? '14px' : '8px',
                      height: isHighlighted ? '28px' : '16px',
                      marginLeft: isHighlighted ? '-7px' : '-4px',
                      backgroundColor: color.bg,
                      borderRadius: isHighlighted ? '7px' : '4px',
                      opacity: !hasAnyHover ? 0.8 : (isHighlighted ? 1 : 0.25),
                      boxShadow: isHighlighted 
                        ? `0 0 0 3px ${color.ring}, 0 4px 12px ${color.glow}` 
                        : `0 1px 3px rgba(0,0,0,0.2)`,
                      transform: isHighlighted ? 'scale(1.1)' : 'scale(1)',
                    }}
                    title={`${event.date}: ${event.title}`}
                  />
                </div>
              );
            })}
            
            {/* Floating event tooltip */}
            {(mouseXTime !== null || hoveredEventId !== null) && (() => {
              const positions = isLine ? eventPositions : candlestickEventPositions;
              let nearest = hoveredEventId ? positions.find(p => p.event.id === hoveredEventId) : null;
              
              if (!nearest && mouseXTime !== null) {
                nearest = [...positions].sort((a, b) => 
                  Math.abs(mouseXTime - a.time) - Math.abs(mouseXTime - b.time)
                )[0];
                
                if (nearest) {
                  const distance = Math.abs(mouseXTime - nearest.time);
                  if (distance > 30 * 24 * 60 * 60 * 1000) nearest = undefined;
                }
              }
              
              if (!nearest) return null;
              
              const startTime = new Date(data[0].date).getTime();
              const endTime = new Date(data[data.length - 1].date).getTime();
              const percent = ((nearest.time - startTime) / (endTime - startTime)) * 100;
              
              const impact = getEventImpactDirection(nearest.event, from, to);
              const bgColor = impact === 'up' ? '#16a34a' : impact === 'down' ? '#dc2626' : '#d97706';
              
              return (
                <div
                  className="absolute bottom-full mb-2 pointer-events-none animate-in fade-in slide-in-from-bottom-1 duration-150"
                  style={{ 
                    left: `${percent}%`,
                    transform: `translateX(${percent > 75 ? '-85%' : percent < 25 ? '-15%' : '-50%'})`,
                  }}
                >
                  <div 
                    className="px-3 py-2 rounded-lg shadow-xl text-white text-xs backdrop-blur-sm"
                    style={{ 
                      backgroundColor: bgColor,
                      boxShadow: `0 4px 20px ${bgColor}40, 0 2px 8px rgba(0,0,0,0.1)`,
                    }}
                  >
                    <div className="font-semibold truncate max-w-[200px]">{nearest.event.title}</div>
                    <div className="text-white/70 mt-0.5 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {nearest.event.date}
                    </div>
                    {/* Arrow */}
                    <div 
                      className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
                      style={{
                        borderLeft: '6px solid transparent',
                        borderRight: '6px solid transparent',
                        borderTop: `6px solid ${bgColor}`,
                      }}
                    />
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
      
      {/* Event list - 紧挨着时间轴，和图表一起压缩 */}
      {showEvents && currencyEvents.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h4 className="font-medium text-gray-800 text-sm">影响 {from}/{to} 汇率的重要事件</h4>
              <span className="text-xs text-gray-400">（共 {currencyEvents.length} 个）</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span>利好{from}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span>利空{from}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span>中性</span>
            </div>
          </div>
          
          {/* 按年份分组显示 */}
          <div>
            {(() => {
              // 按年份分组
              const eventsByYear: Record<string, typeof currencyEvents> = {};
              currencyEvents.forEach(event => {
                const year = event.date.slice(0, 4);
                if (!eventsByYear[year]) eventsByYear[year] = [];
                eventsByYear[year].push(event);
              });
              
              // 按年份倒序排列
              const years = Object.keys(eventsByYear).sort((a, b) => b.localeCompare(a));
              
              return years.map(year => {
                // 同一年内的事件也按日期倒序（从年末到年初）
                const sortedEvents = [...eventsByYear[year]].sort((a, b) => b.date.localeCompare(a.date));
                
                return (
                  <div key={year} className="mb-2">
                    <div className="sticky top-0 bg-white py-1 border-b border-gray-200 mb-1.5">
                      <span className="text-xs font-bold text-gray-700">{year}年</span>
                      <span className="text-xs text-gray-400 ml-2">({sortedEvents.length}个事件)</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
                      {sortedEvents.map((event) => {
                        const impact = getEventImpactDirection(event, from, to);
                        const dotColor = impact === 'up' ? 'bg-green-500' : impact === 'down' ? 'bg-red-500' : 'bg-amber-500';
                        const borderColor = impact === 'up' ? 'border-l-green-500' : impact === 'down' ? 'border-l-red-500' : 'border-l-amber-500';
                        const isActive = displayedEvent?.id === event.id || hoveredEventId === event.id;
                        
                        return (
                          <div 
                            key={event.id}
                            className={`p-1.5 bg-gray-50 rounded border-l-4 ${borderColor} cursor-pointer hover:bg-gray-100 transition-colors duration-200 ${
                              isActive
                                ? 'ring-2 ring-amber-400 bg-amber-50' 
                                : hoveredEventId !== null && hoveredEventId !== event.id
                                  ? 'opacity-50'
                                  : ''
                            }`}
                            onMouseEnter={() => {
                              // 清除之前的延迟计时器
                              if (eventListHoverTimer.current) {
                                clearTimeout(eventListHoverTimer.current);
                              }
                              // 添加小延迟，防止布局变化导致的快速切换
                              eventListHoverTimer.current = setTimeout(() => {
                                setHoveredEventId(event.id);
                                setDisplayedEvent(event);
                                // 找到该事件在图表上的位置
                                const positions = isLine ? eventPositions : candlestickEventPositions;
                                const pos = positions.find(p => p.event.id === event.id);
                                if (pos) {
                                  setMouseXTime(pos.time);
                                } else {
                                  setMouseXTime(new Date(event.date).getTime());
                                }
                              }, 50);
                            }}
                            onMouseLeave={() => {
                              // 清除延迟计时器
                              if (eventListHoverTimer.current) {
                                clearTimeout(eventListHoverTimer.current);
                                eventListHoverTimer.current = null;
                              }
                              // 只清除悬停高亮状态，不清除displayedEvent
                              setHoveredEventId(null);
                              setMouseXTime(null);
                            }}
                            onClick={() => setDisplayedEvent(displayedEvent?.id === event.id ? null : event)}
                          >
                          <div className="flex items-start gap-1.5">
                            <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${dotColor} mt-1.5`}></span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 text-xs text-gray-400">
                                <span>{event.date.slice(5).replace('-', '/')}</span>
                                {event.importance === 'high' && (
                                  <span className="px-1 bg-red-100 text-red-600 rounded text-[10px]">重要</span>
                                )}
                              </div>
                              <h5 className="text-xs font-medium text-gray-800 truncate" title={event.title}>
                                {event.title}
                              </h5>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}
        </div>
        
        {/* Event detail panel - smoothly slides in from right, pushing chart left */}
        <div 
          className={`transition-all duration-500 ease-out overflow-hidden ${
            displayedEvent && showEvents ? 'w-80 ml-4 opacity-100' : 'w-0 ml-0 opacity-0'
          }`}
          style={{
            flexShrink: 0,
            height: `${maxEventPanelHeight}px`, // 固定高度 = 所有事件中内容最长的高度，防止内容变化导致布局跳动
          }}
        >
          {displayedEvent && showEvents && (() => {
            const impact = getEventImpactDirection(displayedEvent, from, to);
            const accentColor = impact === 'up' ? '#22c55e' : impact === 'down' ? '#ef4444' : '#f59e0b';
            const bgGradient = impact === 'up' 
              ? 'from-green-50/80 via-white to-emerald-50/50' 
              : impact === 'down' 
                ? 'from-red-50/80 via-white to-rose-50/50' 
                : 'from-amber-50/80 via-white to-orange-50/50';
            const borderColor = impact === 'up' ? 'border-green-200' : impact === 'down' ? 'border-red-200' : 'border-amber-200';
            
            return (
              <div className={`w-80 h-full flex flex-col bg-gradient-to-br ${bgGradient} backdrop-blur-sm rounded-xl ${borderColor} border shadow-2xl overflow-hidden`}>
                {/* Colored top accent bar */}
                <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}88)` }} />
                
                {/* Header */}
                <div className="px-5 pt-4 pb-3">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div>
                        <span 
                          className="inline-block px-2.5 py-1 rounded-lg text-xs font-semibold text-white shadow-sm"
                          style={{ backgroundColor: accentColor }}
                        >
                          {impact === 'up' ? `利好 ${from}` : impact === 'down' ? `利空 ${from}` : '中性影响'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setDisplayedEvent(null)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-all duration-200 group"
                      title="关闭"
                    >
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  {/* Title */}
                  <h4 className="font-bold text-gray-900 text-lg leading-tight tracking-tight">{displayedEvent.title}</h4>
                  
                  {/* Date badge */}
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100/80 rounded-lg">
                      <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-sm font-medium text-gray-600">{displayedEvent.date}</span>
                    </div>
                    {displayedEvent.currencies && (
                      <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 rounded-lg">
                        <span className="text-xs font-medium text-blue-600">{displayedEvent.currencies.join(' ')}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Divider */}
                <div className="mx-5 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
                
                {/* Content - no scroll, full height */}
                <div className="flex-1 px-5 py-4 space-y-4">
                  {/* 简要描述 */}
                  <div className="bg-white/60 rounded-xl p-4 shadow-sm border border-gray-100">
                    <p className="text-gray-700 text-sm leading-relaxed">{displayedEvent.description}</p>
                  </div>
                  
                  {/* 事件背景 */}
                  {displayedEvent.background && (
                    <div className="group">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center">
                          <svg className="w-3.5 h-3.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">事件背景</span>
                      </div>
                      <p className="text-gray-600 text-sm leading-relaxed pl-8">{displayedEvent.background}</p>
                    </div>
                  )}
                  
                  {/* 市场反应 */}
                  {displayedEvent.marketReaction && (
                    <div className="group">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center">
                          <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                          </svg>
                        </div>
                        <span className="text-xs font-semibold text-blue-500 uppercase tracking-wider">市场反应</span>
                      </div>
                      <p className="text-gray-600 text-sm leading-relaxed pl-8">{displayedEvent.marketReaction}</p>
                    </div>
                  )}
                  
                  {/* 汇率影响分析 */}
                  {displayedEvent.rateImpact && (
                    <div className="group">
                      <div className="flex items-center gap-2 mb-2">
                        <div 
                          className="w-6 h-6 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: `${accentColor}20` }}
                        >
                          <svg className="w-3.5 h-3.5" style={{ color: accentColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: accentColor }}>汇率影响</span>
                      </div>
                      <p className="text-gray-600 text-sm leading-relaxed pl-8">{displayedEvent.rateImpact}</p>
                    </div>
                  )}
                </div>
                
                {/* Footer hint */}
                <div className="px-5 py-3 bg-gray-50/80 border-t border-gray-100">
                  <p className="text-xs text-gray-400 text-center">移动鼠标查看其他事件 · 点击事件卡片固定显示</p>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

export default CurrencyChart;
