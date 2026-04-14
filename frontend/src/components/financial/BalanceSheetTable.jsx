import { useState, useEffect, useRef } from 'react';
import { Search, Download, RefreshCw, Calendar, ChevronDown, ChevronRight, Flame, BarChart3, FileSpreadsheet, Info } from 'lucide-react';
import axios from 'axios';
import { getTradingViewTheme } from '../../utils/theme';

import { getApiBase } from '../../config'
const API_BASE = getApiBase() + '/api';

// TradingView Finansal Widget — API başarısız olduğunda kullanılır
function TradingViewFinancialsFallback({ symbol }) {
    const ref = useRef(null);
    const sym = (symbol || 'THYAO').toUpperCase().replace('.IS', '');
    const tvSym = sym.includes(':') ? sym : `BIST:${sym}`;

    useEffect(() => {
        if (!ref.current) return;
        ref.current.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';
        const s = document.createElement('script');
        s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-financials.js';
        s.async = true;
        s.textContent = JSON.stringify({
            symbol: tvSym, colorTheme: getTradingViewTheme(), isTransparent: true,
            displayMode: 'regular', width: '100%', height: '700', locale: 'tr'
        });
        ref.current.appendChild(s);
        return () => { try { ref.current.innerHTML = ''; } catch {} };
    }, [tvSym]);

    return (
        <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
            <div className="px-4 py-2 bg-dark-900 border-b border-dark-700 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs text-gray-400">TradingView — {tvSym} gerçek finansal veriler</span>
            </div>
            <div ref={ref} className="tradingview-widget-container" style={{ minHeight: 700 }} />
        </div>
    );
}

// Para birimi formatla
function formatCurrency(value) {
    if (value === null || value === undefined || isNaN(value)) return '0';

    const absValue = Math.abs(value);
    const isNegative = value < 0;

    // Binlik ayraçlı format
    const formatted = absValue.toLocaleString('tr-TR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });

    return isNegative ? `-${formatted}` : formatted;
}

// Vurgulu hücre (değer varsa yeşil arka plan)
function HighlightedValue({ value, isHighlighted }) {
    if (!value || value === '0' || value === 0) {
        return <span className="text-gray-500">0</span>;
    }

    return (
        <span className={isHighlighted ? 'bg-teal-500/30 px-2 py-1 rounded text-teal-400 font-mono' : 'text-white font-mono'}>
            {formatCurrency(value)}
        </span>
    );
}

// Katlanabilir satır bileşeni
function CollapsibleSection({ title, children, defaultOpen = false, level = 0, totalColumn1, totalColumn2, currency = 'Bin TRY' }) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    const bgColors = ['bg-dark-800', 'bg-dark-850', 'bg-dark-900'];
    const textColors = ['text-primary-400 font-bold', 'text-white font-semibold', 'text-gray-300'];

    return (
        <>
            <tr
                className={`${bgColors[level] || 'bg-dark-900'} hover:bg-dark-700 cursor-pointer transition-colors border-b border-dark-700/50`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <td className="py-3 px-4">
                    <div className="flex items-center gap-2" style={{ paddingLeft: `${level * 20}px` }}>
                        {children ? (
                            isOpen ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />
                        ) : (
                            <span className="w-4" />
                        )}
                        <BarChart3 className="w-4 h-4 text-gray-500" />
                        <span className={textColors[level] || 'text-gray-300'}>{title}</span>
                    </div>
                </td>
                <td className="py-3 px-4 text-right">
                    <HighlightedValue value={totalColumn1} isHighlighted={totalColumn1 && totalColumn1 !== 0} />
                </td>
                <td className="py-3 px-4 text-right">
                    <HighlightedValue value={totalColumn2} isHighlighted={false} />
                </td>
            </tr>
            {isOpen && children}
        </>
    );
}

// Normal satır bileşeni
function DataRow({ title, value1, value2, level = 2 }) {
    return (
        <tr className="hover:bg-dark-800/50 transition-colors border-b border-dark-700/30">
            <td className="py-2.5 px-4">
                <div className="flex items-center gap-2" style={{ paddingLeft: `${level * 20 + 24}px` }}>
                    <BarChart3 className="w-3 h-3 text-gray-600" />
                    <span className="text-gray-400 text-sm">{title}</span>
                </div>
            </td>
            <td className="py-2.5 px-4 text-right">
                <HighlightedValue value={value1} isHighlighted={value1 && value1 !== 0} />
            </td>
            <td className="py-2.5 px-4 text-right text-gray-400 font-mono text-sm">
                {formatCurrency(value2)}
            </td>
        </tr>
    );
}

export default function BalanceSheetTable() {
    const [symbol, setSymbol] = useState('THYAO');
    const [searchInput, setSearchInput] = useState('THYAO');
    const [period, setPeriod] = useState('quarterly');
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedPeriod1, setSelectedPeriod1] = useState(0);
    const [selectedPeriod2, setSelectedPeriod2] = useState(1);
    const [currency, setCurrency] = useState('Bin TRY');

    // Veri çekme
    const fetchBalanceSheet = async (stockSymbol) => {
        setLoading(true);
        setError(null);

        try {
            const response = await axios.get(
                `${API_BASE}/financials/${stockSymbol}/balance-sheet?period=${period}&years=10`
            );

            if (response.data.success && response.data.data && response.data.data.length > 0) {
                setData(response.data.data);
                setSymbol(stockSymbol);
                // İlk iki periyodu seç
                setSelectedPeriod1(0);
                setSelectedPeriod2(Math.min(1, response.data.data.length - 1));
            } else {
                setData([]);
                setError(`"${stockSymbol}" için bilanço verisi bulunamadı.`);
            }
        } catch (err) {
            console.error('Balance sheet fetch error:', err);
            setData([]);
            setError('Bilanço verisi yüklenirken hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBalanceSheet(symbol);
    }, [period]);

    const handleSearch = () => {
        if (searchInput.trim()) {
            fetchBalanceSheet(searchInput.toUpperCase());
        }
    };

    // Seçili dönem verileri
    const period1Data = data[selectedPeriod1] || {};
    const period2Data = data[selectedPeriod2] || {};

    // Periyot seçenekleri
    const periodOptions = data.map((d, idx) => ({
        value: idx,
        label: d.period
    }));

    if (loading && data.length === 0) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <RefreshCw className="w-12 h-12 text-primary-500 animate-spin mx-auto mb-4" />
                    <p className="text-gray-400">Bilanço verileri yükleniyor...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-surface-100 rounded-2xl p-6 border border-dark-700">
                <div className="flex items-center gap-3 mb-4">
                    <BarChart3 className="w-7 h-7 text-primary-500" />
                    <div>
                        <h1 className="text-2xl font-bold text-white">Bilanço</h1>
                        <p className="text-gray-400 text-sm">Şirketlerin finansal durum tablosunu inceleyin</p>
                    </div>
                </div>

                {/* Arama */}
                <div className="bg-dark-800 rounded-xl p-4 mb-4">
                    <label className="block text-xs text-gray-500 mb-2">HİSSE ARA</label>
                    <div className="flex responsive-stack gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                            <input
                                type="text"
                                placeholder="THYAO"
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
                                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                                className="w-full pl-10 pr-4 py-3 bg-dark-900 border border-dark-600 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
                            />
                        </div>
                        <button
                            onClick={handleSearch}
                            className="px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 w-full sm:w-auto"
                        >
                            <Search className="w-4 h-4" />
                            SORGULA
                        </button>
                    </div>
                </div>

                {/* Seçili Hisse */}
                {data.length > 0 && (
                    <div className="flex items-center gap-3 bg-dark-800 rounded-xl p-4">
                        <div className="w-12 h-12 bg-primary-500/20 rounded-xl flex items-center justify-center">
                            <BarChart3 className="w-6 h-6 text-primary-400" />
                        </div>
                        <div>
                            <p className="font-bold text-white text-lg">{symbol}</p>
                            <p className="text-sm text-gray-500">{symbol}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Bilgi Notu */}
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-start gap-3">
                <Info className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                <p className="text-yellow-400 text-sm">
                    Mali tablolar içinde son yılsonu rakamları enflasyon düzeltmesi ile açıklanan en son döneme çekilmektedir.
                </p>
            </div>

            {/* Filtreler */}
            <div className="flex responsive-toolbar items-start sm:items-center justify-between gap-4">
                <div className="flex responsive-stack items-start sm:items-center gap-3">
                    {/* Periyot */}
                    <select
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                        className="px-4 py-2 bg-dark-800 border border-dark-600 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                        <option value="quarterly">Tüm Periyotlar</option>
                        <option value="annual">Yıllık</option>
                    </select>

                    {/* Para birimi */}
                    <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="px-4 py-2 bg-dark-800 border border-dark-600 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                        <option value="Bin TRY">Bin TRY</option>
                        <option value="Milyon TRY">Milyon TRY</option>
                    </select>
                </div>

                <div className="flex responsive-toolbar-end items-center gap-2">
                    <button className="px-4 py-2 bg-teal-500/20 border border-teal-500/50 text-teal-400 rounded-xl text-sm font-medium hover:bg-teal-500/30 transition-colors flex items-center gap-2">
                        <Flame className="w-4 h-4" />
                        Heat Map
                    </button>
                    <button className="px-4 py-2 bg-dark-800 border border-dark-600 text-gray-300 rounded-xl text-sm font-medium hover:bg-dark-700 transition-colors flex items-center gap-2">
                        <BarChart3 className="w-4 h-4" />
                        Karşılaştır
                    </button>
                    <button className="px-4 py-2 bg-primary-500 text-white rounded-xl text-sm font-medium hover:bg-primary-600 transition-colors flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4" />
                        Excel
                    </button>
                </div>
            </div>

            {/* Dönem Seçici */}
            {data.length > 0 && (
                <div className="bg-gradient-to-r from-dark-800 to-dark-900 rounded-xl p-4 flex responsive-stack items-center justify-center gap-4 sm:gap-6">
                    <div className="flex responsive-stack items-start sm:items-center gap-3">
                        <span className="text-gray-400 font-medium">DÖNEM 1</span>
                        <select
                            value={selectedPeriod1}
                            onChange={(e) => setSelectedPeriod1(parseInt(e.target.value))}
                            className="px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-primary-400 font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                            {periodOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>

                    <span className="text-gray-500 font-bold text-xl">VS</span>

                    <div className="flex responsive-stack items-start sm:items-center gap-3">
                        <select
                            value={selectedPeriod2}
                            onChange={(e) => setSelectedPeriod2(parseInt(e.target.value))}
                            className="px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                            {periodOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                        <span className="text-gray-400 font-medium">DÖNEM 2</span>
                    </div>
                </div>
            )}

            {/* Error + TradingView Fallback */}
            {error && (
                <div className="space-y-4">
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 flex items-center gap-2">
                        <Info className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                        <p className="text-yellow-300 text-sm">Özet bilanço verisi şu an alınamadı — TradingView'dan gerçek veriler gösteriliyor:</p>
                    </div>
                    <TradingViewFinancialsFallback symbol={symbol} />
                </div>
            )}

            {/* Tablo */}
            {data.length > 0 && (
                <div className="bg-surface-100 rounded-2xl border border-dark-700 overflow-hidden">
                    <div className="table-shell">
                        <table className="w-full table-min-financial">
                            <thead>
                                <tr className="bg-dark-800 border-b border-dark-700">
                                    <th className="py-4 px-4 text-left text-white font-semibold w-1/2"></th>
                                    <th className="py-4 px-4 text-right text-white font-semibold">
                                        {period1Data.period || 'Dönem 1'}
                                    </th>
                                    <th className="py-4 px-4 text-right text-gray-400">
                                        {period2Data.period || 'Dönem 2'}
                                        <span className="block text-xs text-gray-500">{currency}</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* DÖNEN VARLIKLAR */}
                                <CollapsibleSection
                                    title="Dönen Varlıklar"
                                    defaultOpen={true}
                                    level={0}
                                    totalColumn1={period1Data.assets?.currentAssets?.total}
                                    totalColumn2={period2Data.assets?.currentAssets?.total}
                                >
                                    <DataRow
                                        title="Nakit ve Nakit Benzerleri"
                                        value1={period1Data.assets?.currentAssets?.cashAndCashEquivalents}
                                        value2={period2Data.assets?.currentAssets?.cashAndCashEquivalents}
                                    />
                                    <DataRow
                                        title="Finansal Yatırımlar"
                                        value1={period1Data.assets?.currentAssets?.shortTermFinancialInvestments}
                                        value2={period2Data.assets?.currentAssets?.shortTermFinancialInvestments}
                                    />
                                    <DataRow
                                        title="Ticari Alacaklar"
                                        value1={period1Data.assets?.currentAssets?.tradeReceivables}
                                        value2={period2Data.assets?.currentAssets?.tradeReceivables}
                                    />
                                    <DataRow
                                        title="Finans Sektörü Faaliyetlerinden Alacaklar"
                                        value1={period1Data.assets?.currentAssets?.financeSectorReceivables}
                                        value2={period2Data.assets?.currentAssets?.financeSectorReceivables}
                                    />
                                    <DataRow
                                        title="Diğer Alacaklar"
                                        value1={period1Data.assets?.currentAssets?.otherReceivables}
                                        value2={period2Data.assets?.currentAssets?.otherReceivables}
                                    />
                                    <DataRow
                                        title="Müşteri Sözleşmelerinden Doğan Varlıklar"
                                        value1={period1Data.assets?.currentAssets?.contractAssets}
                                        value2={period2Data.assets?.currentAssets?.contractAssets}
                                    />
                                    <DataRow
                                        title="Stoklar"
                                        value1={period1Data.assets?.currentAssets?.inventories}
                                        value2={period2Data.assets?.currentAssets?.inventories}
                                    />
                                    <DataRow
                                        title="Canlı Varlıklar"
                                        value1={period1Data.assets?.currentAssets?.biologicalAssets}
                                        value2={period2Data.assets?.currentAssets?.biologicalAssets}
                                    />
                                    <DataRow
                                        title="Diğer Dönen Varlıklar"
                                        value1={period1Data.assets?.currentAssets?.otherCurrentAssets}
                                        value2={period2Data.assets?.currentAssets?.otherCurrentAssets}
                                    />
                                    <DataRow
                                        title="Satış Amacıyla Elde Tutulan Duran Varlıklar"
                                        value1={period1Data.assets?.currentAssets?.assetsHeldForSale}
                                        value2={period2Data.assets?.currentAssets?.assetsHeldForSale}
                                    />
                                </CollapsibleSection>

                                {/* Ara Toplam */}
                                <tr className="bg-dark-700 border-y border-dark-600">
                                    <td className="py-3 px-4">
                                        <span className="text-yellow-400 font-semibold">(Ara Toplam)</span>
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                        <span className="bg-teal-500/30 px-3 py-1 rounded text-teal-400 font-mono font-bold">
                                            {formatCurrency(period1Data.assets?.currentAssets?.total)}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-right text-gray-400 font-mono">
                                        {formatCurrency(period2Data.assets?.currentAssets?.total)}
                                    </td>
                                </tr>

                                {/* DURAN VARLIKLAR */}
                                <CollapsibleSection
                                    title="Duran Varlıklar"
                                    defaultOpen={false}
                                    level={0}
                                    totalColumn1={period1Data.assets?.nonCurrentAssets?.total}
                                    totalColumn2={period2Data.assets?.nonCurrentAssets?.total}
                                >
                                    <DataRow
                                        title="Maddi Duran Varlıklar"
                                        value1={period1Data.assets?.nonCurrentAssets?.tangibleAssets}
                                        value2={period2Data.assets?.nonCurrentAssets?.tangibleAssets}
                                    />
                                    <DataRow
                                        title="Maddi Olmayan Duran Varlıklar"
                                        value1={period1Data.assets?.nonCurrentAssets?.intangibleAssets}
                                        value2={period2Data.assets?.nonCurrentAssets?.intangibleAssets}
                                    />
                                    <DataRow
                                        title="Şerefiye"
                                        value1={period1Data.assets?.nonCurrentAssets?.goodwill}
                                        value2={period2Data.assets?.nonCurrentAssets?.goodwill}
                                    />
                                    <DataRow
                                        title="Yatırım Amaçlı Gayrimenkuller"
                                        value1={period1Data.assets?.nonCurrentAssets?.investmentProperty}
                                        value2={period2Data.assets?.nonCurrentAssets?.investmentProperty}
                                    />
                                    <DataRow
                                        title="Uzun Vadeli Finansal Yatırımlar"
                                        value1={period1Data.assets?.nonCurrentAssets?.longTermFinancialInvestments}
                                        value2={period2Data.assets?.nonCurrentAssets?.longTermFinancialInvestments}
                                    />
                                </CollapsibleSection>

                                {/* KISA VADELİ YÜKÜMLÜLÜKLER */}
                                <CollapsibleSection
                                    title="Kısa Vadeli Yükümlülükler"
                                    defaultOpen={false}
                                    level={0}
                                    totalColumn1={period1Data.liabilities?.currentLiabilities?.total}
                                    totalColumn2={period2Data.liabilities?.currentLiabilities?.total}
                                >
                                    <DataRow
                                        title="Kısa Vadeli Borçlanmalar"
                                        value1={period1Data.liabilities?.currentLiabilities?.shortTermBorrowings}
                                        value2={period2Data.liabilities?.currentLiabilities?.shortTermBorrowings}
                                    />
                                    <DataRow
                                        title="Ticari Borçlar"
                                        value1={period1Data.liabilities?.currentLiabilities?.tradePayables}
                                        value2={period2Data.liabilities?.currentLiabilities?.tradePayables}
                                    />
                                </CollapsibleSection>

                                {/* UZUN VADELİ YÜKÜMLÜLÜKLER */}
                                <CollapsibleSection
                                    title="Uzun Vadeli Yükümlülükler"
                                    defaultOpen={false}
                                    level={0}
                                    totalColumn1={period1Data.liabilities?.nonCurrentLiabilities?.total}
                                    totalColumn2={period2Data.liabilities?.nonCurrentLiabilities?.total}
                                >
                                    <DataRow
                                        title="Uzun Vadeli Borçlanmalar"
                                        value1={period1Data.liabilities?.nonCurrentLiabilities?.longTermBorrowings}
                                        value2={period2Data.liabilities?.nonCurrentLiabilities?.longTermBorrowings}
                                    />
                                </CollapsibleSection>

                                {/* ÖZKAYNAKLAR */}
                                <CollapsibleSection
                                    title="Özkaynaklar"
                                    defaultOpen={false}
                                    level={0}
                                    totalColumn1={period1Data.equity?.total}
                                    totalColumn2={period2Data.equity?.total}
                                >
                                    <DataRow
                                        title="Ödenmiş Sermaye"
                                        value1={period1Data.equity?.paidInCapital}
                                        value2={period2Data.equity?.paidInCapital}
                                    />
                                    <DataRow
                                        title="Geçmiş Yıllar Karları"
                                        value1={period1Data.equity?.retainedEarnings}
                                        value2={period2Data.equity?.retainedEarnings}
                                    />
                                    <DataRow
                                        title="Net Dönem Karı/Zararı"
                                        value1={period1Data.equity?.profitLossForPeriod}
                                        value2={period2Data.equity?.profitLossForPeriod}
                                    />
                                </CollapsibleSection>

                                {/* TOPLAM VARLIKLAR */}
                                <tr className="bg-dark-700 border-t-2 border-primary-500">
                                    <td className="py-4 px-4">
                                        <span className="text-yellow-400 font-bold text-lg">TOPLAM VARLIKLAR</span>
                                    </td>
                                    <td className="py-4 px-4 text-right">
                                        <span className="bg-teal-500/30 px-4 py-2 rounded text-teal-400 font-mono font-bold text-lg">
                                            {formatCurrency(period1Data.assets?.total)}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4 text-right text-gray-400 font-mono text-lg">
                                        {formatCurrency(period2Data.assets?.total)}
                                    </td>
                                </tr>

                                {/* TOPLAM KAYNAKLAR */}
                                <tr className="bg-dark-700">
                                    <td className="py-4 px-4">
                                        <span className="text-yellow-400 font-bold text-lg">TOPLAM KAYNAKLAR</span>
                                    </td>
                                    <td className="py-4 px-4 text-right">
                                        <span className="bg-teal-500/30 px-4 py-2 rounded text-teal-400 font-mono font-bold text-lg">
                                            {formatCurrency((period1Data.liabilities?.total || 0) + (period1Data.equity?.total || 0))}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4 text-right text-gray-400 font-mono text-lg">
                                        {formatCurrency((period2Data.liabilities?.total || 0) + (period2Data.equity?.total || 0))}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
