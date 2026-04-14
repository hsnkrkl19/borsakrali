import { useState, useEffect, useRef } from 'react';
import { Search, Download, RefreshCw, Calendar, DollarSign, TrendingDown, TrendingUp } from 'lucide-react';
import axios from 'axios';
import CollapsibleRow, { TableRow } from './CollapsibleRow';
import { formatCurrency } from '../../utils/formatters';
import { getTradingViewTheme } from '../../utils/theme';

import { getApiBase } from '../../config'
const API_BASE = getApiBase() + '/api';

function TradingViewFinancialsFallback({ symbol }) {
    const ref = useRef(null);
    const sym = (symbol || 'THYAO').toUpperCase().replace('.IS', '');
    const tvSym = sym.includes(':') ? sym : `BIST:${sym}`;
    useEffect(() => {
        if (!ref.current) return;
        ref.current.innerHTML = '<div class="tradingview-widget-container__widget"></div>';
        const s = document.createElement('script');
        s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-financials.js';
        s.async = true;
        s.textContent = JSON.stringify({
            symbol: tvSym,
            colorTheme: getTradingViewTheme(),
            isTransparent: true,
            displayMode: 'regular',
            width: '100%',
            height: '700',
            locale: 'tr'
        });
        ref.current.appendChild(s);
        return () => { try { ref.current.innerHTML = ''; } catch {} };
    }, [tvSym]);
    return (
        <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
            <div className="px-4 py-2 bg-dark-900 border-b border-dark-700 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
                <span className="text-xs text-gray-400">TradingView — {tvSym} gerçek finansal veriler</span>
            </div>
            <div ref={ref} className="tradingview-widget-container" style={{ minHeight: 700 }} />
        </div>
    );
}

export default function CashFlowTable() {
    const [symbol, setSymbol] = useState('THYAO');
    const [searchInput, setSearchInput] = useState('THYAO');
    const [period, setPeriod] = useState('annual');
    const [years, setYears] = useState(5);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Veri çekme
    const fetchCashFlow = async (stockSymbol) => {
        setLoading(true);
        setError(null);

        try {
            const response = await axios.get(
                `${API_BASE}/financials/${stockSymbol}/cash-flow?period=${period}&years=${years}`
            );

            if (response.data.success && response.data.data && response.data.data.length > 0) {
                setData(response.data.data);
                setSymbol(stockSymbol);
            } else {
                setData([]);
                setError(`❌ "${stockSymbol}" hisse kodu bulunamadı veya hatalı. Lütfen geçerli bir BIST hisse kodu girin.`);
            }
        } catch (err) {
            console.error('Cash flow fetch error:', err);
            setData([]);
            if (err.response?.status === 404) {
                setError(`❌ "${stockSymbol}" hisse kodu bulunamadı. Lütfen geçerli bir BIST hisse kodu girin.`);
            } else {
                setError('⚠️ Nakit akım verisi yüklenirken hata oluştu. Lütfen tekrar deneyin.');
            }
        } finally {
            setLoading(false);
        }
    };

    // İlk yükleme
    useEffect(() => {
        fetchCashFlow(symbol);
    }, [period, years]);

    // Arama
    const handleSearch = () => {
        if (searchInput.trim()) {
            fetchCashFlow(searchInput.toUpperCase());
        }
    };

    const displayData = data.slice(0, 2);

    if (loading && data.length === 0) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <RefreshCw className="w-12 h-12 text-gold-500 animate-spin mx-auto mb-4" />
                    <p className="text-gray-400">Nakit akım verileri yükleniyor...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header & Controls */}
            <div className="bg-surface-100 rounded-xl p-6 border border-gold-500/20">
                <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold bg-gradient-to-r from-gold-400 to-gold-600 bg-clip-text text-transparent">
                            Nakit Akım Tablosu
                        </h2>
                        <p className="text-gray-400 text-sm mt-1">
                            İşletme, yatırım ve finansman faaliyetlerinden nakit akışları
                        </p>
                    </div>

                    <div className="flex responsive-stack items-stretch lg:items-center gap-3 w-full lg:w-auto">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Hisse Ara (THYAO)"
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
                                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                                className="pl-10 pr-4 py-2 bg-surface-200 border border-surface-300 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gold-500 w-full sm:w-56"
                            />
                        </div>
                        <button
                            onClick={handleSearch}
                            className="px-4 py-2 bg-gold-500 hover:bg-gold-600 text-dark-950 font-semibold rounded-lg transition-colors"
                        >
                            Sorgula
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex responsive-toolbar items-start sm:items-center gap-4 mt-4 pt-4 border-t border-surface-300">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <select
                            value={period}
                            onChange={(e) => setPeriod(e.target.value)}
                            className="px-3 py-1.5 bg-surface-200 border border-surface-300 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                        >
                            <option value="annual">Yıllık</option>
                            <option value="quarterly">Çeyreklik</option>
                        </select>
                    </div>

                    <select
                        value={years}
                        onChange={(e) => setYears(parseInt(e.target.value))}
                        className="px-3 py-1.5 bg-surface-200 border border-surface-300 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                    >
                        <option value={3}>Son 3 Yıl</option>
                        <option value={5}>Son 5 Yıl</option>
                        <option value={10}>Son 10 Yıl</option>
                    </select>

                    <div className="flex responsive-toolbar-end gap-2 ml-auto">
                        <button
                            onClick={() => alert('Excel export yakında!')}
                            className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                            <Download className="w-4 h-4" />
                            Excel
                        </button>
                        <button
                            onClick={() => fetchCashFlow(symbol)}
                            disabled={loading}
                            className="px-4 py-1.5 bg-surface-200 hover:bg-surface-300 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            Yenile
                        </button>
                    </div>
                </div>
            </div>

            {/* Error State — TradingView fallback */}
            {error && (
                <div className="space-y-3">
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3">
                        <p className="text-yellow-400 text-sm">⚠️ API verisi alınamadı — TradingView canlı verileri gösteriliyor</p>
                    </div>
                    <TradingViewFinancialsFallback symbol={symbol} />
                </div>
            )}

            {/* Tablo */}
            {data.length > 0 && (
                <div className="bg-surface-100 rounded-xl border border-gold-500/20 overflow-hidden">
                    <div className="table-shell">
                        <table className="w-full table-min-wide">
                            <thead className="bg-surface-200 border-b-2 border-gold-500/30">
                                <tr>
                                    <th className="px-4 py-3 text-left text-white font-semibold">
                                        {symbol} - Nakit Akım Tablosu
                                    </th>
                                    {displayData.map((item, idx) => (
                                        <th key={idx} className="px-4 py-3 text-right text-gold-400 font-semibold">
                                            {item.period}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {/* İŞLETME FAALİYETLERİ */}
                                <CollapsibleRow
                                    title="İŞLETME FAALİYETLERİNDEN NAKİT AKIŞLARI"
                                    columns={displayData.map(d => formatCurrency(d.operatingActivities?.total))}
                                    defaultOpen={true}
                                    level={0}
                                    highlight={true}
                                >
                                    <TableRow
                                        title="Net Dönem Karı/Zararı"
                                        columns={displayData.map(d => formatCurrency(d.operatingActivities?.netProfit))}
                                        level={1}
                                        bold={true}
                                    />

                                    <CollapsibleRow
                                        title="Düzeltmeler"
                                        columns={displayData.map(d => formatCurrency(d.operatingActivities?.adjustments?.total))}
                                        level={1}
                                    >
                                        <TableRow
                                            title="Amortisman ve İtfa Giderleri"
                                            columns={displayData.map(d => formatCurrency(d.operatingActivities?.adjustments?.depreciation))}
                                            level={2}
                                        />
                                        <TableRow
                                            title="Karşılık Değişimleri"
                                            columns={displayData.map(d => formatCurrency(d.operatingActivities?.adjustments?.provisionChanges || 0))}
                                            level={2}
                                        />
                                        <TableRow
                                            title="Faiz Giderleri"
                                            columns={displayData.map(d => formatCurrency(d.operatingActivities?.adjustments?.interestExpense || 0))}
                                            level={2}
                                        />
                                    </CollapsibleRow>

                                    <CollapsibleRow
                                        title="İşletme Sermayesi Değişimleri"
                                        columns={displayData.map(d => formatCurrency(d.operatingActivities?.workingCapitalChanges?.total))}
                                        level={1}
                                    >
                                        <TableRow
                                            title="Stok Azalışı/(Artışı)"
                                            columns={displayData.map(d => formatCurrency(d.operatingActivities?.workingCapitalChanges?.inventoryDecrease))}
                                            level={2}
                                        />
                                        <TableRow
                                            title="Ticari Alacaklar Azalışı/(Artışı)"
                                            columns={displayData.map(d => formatCurrency(d.operatingActivities?.workingCapitalChanges?.receivablesDecrease))}
                                            level={2}
                                        />
                                        <TableRow
                                            title="Ticari Borçlar Artışı/(Azalışı)"
                                            columns={displayData.map(d => formatCurrency(d.operatingActivities?.workingCapitalChanges?.payablesIncrease))}
                                            level={2}
                                        />
                                    </CollapsibleRow>
                                </CollapsibleRow>

                                {/* YATIRIM FAALİYETLERİ */}
                                <CollapsibleRow
                                    title="YATIRIM FAALİYETLERİNDEN NAKİT AKIŞLARI"
                                    columns={displayData.map(d => formatCurrency(d.investingActivities?.total))}
                                    defaultOpen={true}
                                    level={0}
                                    highlight={true}
                                >
                                    <TableRow
                                        title="Maddi Duran Varlık Alımları (-)"
                                        columns={displayData.map(d => formatCurrency(d.investingActivities?.tangibleAssetPurchases))}
                                        level={1}
                                    />
                                    <TableRow
                                        title="Maddi Duran Varlık Satışları"
                                        columns={displayData.map(d => formatCurrency(d.investingActivities?.tangibleAssetSales || 0))}
                                        level={1}
                                    />
                                    <TableRow
                                        title="Finansal Yatırım Alımları (-)"
                                        columns={displayData.map(d => formatCurrency(d.investingActivities?.financialInvestmentPurchases))}
                                        level={1}
                                    />
                                    <TableRow
                                        title="Finansal Yatırım Satışları"
                                        columns={displayData.map(d => formatCurrency(d.investingActivities?.financialInvestmentSales || 0))}
                                        level={1}
                                    />
                                </CollapsibleRow>

                                {/* FİNANSMAN FAALİYETLERİ */}
                                <CollapsibleRow
                                    title="FİNANSMAN FAALİYETLERİNDEN NAKİT AKIŞLARI"
                                    columns={displayData.map(d => formatCurrency(d.financingActivities?.total))}
                                    defaultOpen={true}
                                    level={0}
                                    highlight={true}
                                >
                                    <TableRow
                                        title="Borç Alımları"
                                        columns={displayData.map(d => formatCurrency(d.financingActivities?.loanProceeds || 0))}
                                        level={1}
                                    />
                                    <TableRow
                                        title="Borç Ödemeleri (-)"
                                        columns={displayData.map(d => formatCurrency(d.financingActivities?.loanRepayments))}
                                        level={1}
                                    />
                                    <TableRow
                                        title="Ödenen Temettüler (-)"
                                        columns={displayData.map(d => formatCurrency(d.financingActivities?.dividendsPaid))}
                                        level={1}
                                    />
                                    <TableRow
                                        title="Sermaye Artırımı"
                                        columns={displayData.map(d => formatCurrency(d.financingActivities?.capitalIncrease))}
                                        level={1}
                                    />
                                </CollapsibleRow>

                                {/* NAKİT DEĞİŞİMİ */}
                                <CollapsibleRow
                                    title="NAKİT VE NAKİT BENZERLERİNDEKİ NET DEĞİŞİM"
                                    columns={displayData.map(d => formatCurrency(d.netCashChange))}
                                    level={0}
                                    highlight={true}
                                >
                                    <TableRow
                                        title="Dönem Başı Nakit"
                                        columns={displayData.map(d => formatCurrency(d.beginningCash || 0))}
                                        level={1}
                                    />
                                    <TableRow
                                        title="Dönem Sonu Nakit"
                                        columns={displayData.map(d => formatCurrency(d.endingCash || 0))}
                                        level={1}
                                        bold={true}
                                    />
                                </CollapsibleRow>

                                {/* SERBEST NAKİT AKIŞI */}
                                <TableRow
                                    title="SERBEST NAKİT AKIŞI (Free Cash Flow)"
                                    columns={displayData.map(d => formatCurrency(d.freeCashFlow))}
                                    level={0}
                                    bold={true}
                                />
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Özet Kartlar */}
            {data.length > 0 && displayData[0] && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-gradient-to-br from-green-500/10 to-green-600/10 border border-green-500/30 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-gray-400 text-sm">İşletme Faaliyetleri</span>
                            <DollarSign className="w-4 h-4 text-green-400" />
                        </div>
                        <p className="text-2xl font-bold text-green-400">
                            {formatCurrency(displayData[0]?.operatingActivities?.total)}
                        </p>
                    </div>

                    <div className="bg-gradient-to-br from-red-500/10 to-red-600/10 border border-red-500/30 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-gray-400 text-sm">Yatırım Faaliyetleri</span>
                            <TrendingDown className="w-4 h-4 text-red-400" />
                        </div>
                        <p className="text-2xl font-bold text-red-400">
                            {formatCurrency(displayData[0]?.investingActivities?.total)}
                        </p>
                    </div>

                    <div className="bg-gradient-to-br from-gold-500/10 to-gold-600/10 border border-gold-500/30 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-gray-400 text-sm">Serbest Nakit Akışı</span>
                            <TrendingUp className="w-4 h-4 text-gold-400" />
                        </div>
                        <p className="text-2xl font-bold text-gold-400">
                            {formatCurrency(displayData[0].freeCashFlow)}
                        </p>
                    </div>
                </div>
            )}

            {/* Bilgi Notu */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                <p className="text-blue-400 text-sm">
                    <strong>Not:</strong> Nakit akım tabloları gerçek Yahoo Finance verileridir.
                    Serbest nakit akışı = İşletme faaliyetlerinden nakit akışı + Yatırım harcamaları
                </p>
            </div>
        </div>
    );
}
