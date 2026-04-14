import { useState, useEffect } from 'react';
import { Search, Download, RefreshCw, TrendingUp, Activity, DollarSign, BarChart3 } from 'lucide-react';
import axios from 'axios';
import { formatRatio, formatPercent, getChangeColor } from '../../utils/formatters';

import { getApiBase } from '../../config'
const API_BASE = getApiBase() + '/api';

export default function RatiosTable() {
    const [symbol, setSymbol] = useState('THYAO');
    const [searchInput, setSearchInput] = useState('THYAO');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Veri çekme
    const fetchRatios = async (stockSymbol) => {
        setLoading(true);
        setError(null);

        try {
            const response = await axios.get(`${API_BASE}/financials/${stockSymbol}/ratios`);

            if (response.data.success && response.data.data) {
                setData(response.data.data);
                setSymbol(stockSymbol);
            } else {
                setData(null);
                setError(`❌ "${stockSymbol}" hisse kodu bulunamadı veya hatalı.`);
            }
        } catch (err) {
            console.error('Ratios fetch error:', err);
            setData(null);
            if (err.response?.status === 404) {
                setError(`❌ "${stockSymbol}" hisse kodu bulunamadı.`);
            } else {
                setError('⚠️ Mali oranlar yüklenirken hata oluştu.');
            }
        } finally {
            setLoading(false);
        }
    };

    // İlk yükleme
    useEffect(() => {
        fetchRatios(symbol);
    }, []);

    // Arama
    const handleSearch = () => {
        if (searchInput.trim()) {
            fetchRatios(searchInput.toUpperCase());
        }
    };

    if (loading && !data) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <RefreshCw className="w-12 h-12 text-gold-500 animate-spin mx-auto mb-4" />
                    <p className="text-gray-400">Mali oranlar yükleniyor...</p>
                </div>
            </div>
        );
    }

    const RatioCard = ({ title, value, icon: Icon, trend, color = 'blue' }) => {
        const colorClasses = {
            blue: 'from-blue-500/10 to-blue-600/10 border-blue-500/30 text-blue-400',
            green: 'from-green-500/10 to-green-600/10 border-green-500/30 text-green-400',
            gold: 'from-gold-500/10 to-gold-600/10 border-gold-500/30 text-gold-400',
            purple: 'from-purple-500/10 to-purple-600/10 border-purple-500/30 text-purple-400',
            red: 'from-red-500/10 to-red-600/10 border-red-500/30 text-red-400'
        };

        return (
            <div className={`bg-gradient-to-br ${colorClasses[color]} border rounded-xl p-4`}>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400 text-sm">{title}</span>
                    <Icon className={`w-5 h-5 ${colorClasses[color].split(' ')[2]}`} />
                </div>
                <p className={`text-2xl font-bold ${colorClasses[color].split(' ')[2]}`}>
                    {value}
                </p>
                {trend && (
                    <p className={`text-xs mt-1 ${getChangeColor(trend)}`}>
                        {trend > 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(2)}%
                    </p>
                )}
            </div>
        );
    };

    const RatioRow = ({ label, value, description }) => (
        <tr className="border-b border-surface-300 hover:bg-surface-200 transition-colors">
            <td className="px-4 py-3 text-white">
                <div>
                    <p className="font-medium">{label}</p>
                    {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
                </div>
            </td>
            <td className="px-4 py-3 text-right font-mono text-lg font-semibold text-gold-400">
                {value}
            </td>
        </tr>
    );

    return (
        <div className="space-y-6">
            {/* Header & Controls */}
            <div className="bg-surface-100 rounded-xl p-6 border border-gold-500/20">
                <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold bg-gradient-to-r from-gold-400 to-gold-600 bg-clip-text text-transparent">
                            Mali Oranlar
                        </h2>
                        <p className="text-gray-400 text-sm mt-1">
                            Likidite, kaldıraç, karlılık, faaliyet ve değerleme oranları
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

                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-surface-300">
                    <button
                        onClick={() => alert('Excel export yakında!')}
                        className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                        <Download className="w-4 h-4" />
                        Excel
                    </button>
                    <button
                        onClick={() => fetchRatios(symbol)}
                        disabled={loading}
                        className="px-4 py-1.5 bg-surface-200 hover:bg-surface-300 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Yenile
                    </button>
                </div>
            </div>

            {/* Error State */}
            {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                    <p className="text-red-400">{error}</p>
                </div>
            )}

            {/* Özet Kartlar */}
            {data && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <RatioCard
                        title="Cari Oran"
                        value={formatRatio(data.liquidity?.currentRatio || 0)}
                        icon={Activity}
                        color="green"
                    />
                    <RatioCard
                        title="Borç/Özkaynak"
                        value={formatRatio(data.leverage?.debtToEquity || 0)}
                        icon={TrendingUp}
                        color="red"
                    />
                    <RatioCard
                        title="Özkaynak Karlılığı (ROE)"
                        value={formatPercent(data.profitability?.roe || 0)}
                        icon={DollarSign}
                        color="gold"
                    />
                    <RatioCard
                        title="Net Kar Marjı"
                        value={formatPercent(data.profitability?.netProfitMargin || 0)}
                        icon={BarChart3}
                        color="blue"
                    />
                </div>
            )}

            {/* Detaylı Oranlar Tabloları */}
            {data && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Likidite Oranları */}
                    <div className="bg-surface-100 rounded-xl border border-green-500/20 overflow-hidden">
                        <div className="bg-green-500/10 border-b border-green-500/20 px-4 py-3">
                            <h3 className="text-lg font-semibold text-green-400 flex items-center gap-2">
                                <Activity className="w-5 h-5" />
                                Likidite Oranları
                            </h3>
                        </div>
                        <table className="w-full">
                            <tbody>
                                <RatioRow
                                    label="Cari Oran"
                                    value={formatRatio(data.liquidity?.currentRatio || 0)}
                                    description="Dönen Varlıklar / Kısa Vadeli Yükümlülükler"
                                />
                                <RatioRow
                                    label="Asit-Test Oranı"
                                    value={formatRatio(data.liquidity?.quickRatio || 0)}
                                    description="(Dönen Varlıklar - Stoklar) / KVYK"
                                />
                                <RatioRow
                                    label="Nakit Oranı"
                                    value={formatRatio(data.liquidity?.cashRatio || 0)}
                                    description="Nakit ve Nakit Benzerleri / KVYK"
                                />
                            </tbody>
                        </table>
                    </div>

                    {/* Kaldıraç Oranları */}
                    <div className="bg-surface-100 rounded-xl border border-red-500/20 overflow-hidden">
                        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-3">
                            <h3 className="text-lg font-semibold text-red-400 flex items-center gap-2">
                                <TrendingUp className="w-5 h-5" />
                                Kaldıraç Oranları
                            </h3>
                        </div>
                        <table className="w-full">
                            <tbody>
                                <RatioRow
                                    label="Borç/Özkaynak"
                                    value={formatRatio(data.leverage?.debtToEquity || 0)}
                                    description="Toplam Borç / Özkaynaklar"
                                />
                                <RatioRow
                                    label="Borç/Varlık"
                                    value={formatRatio(data.leverage?.debtToAssets || 0)}
                                    description="Toplam Borç / Toplam Varlıklar"
                                />
                                <RatioRow
                                    label="Özkaynak Çarpanı"
                                    value={formatRatio(data.leverage?.equityMultiplier || 0)}
                                    description="Toplam Varlıklar / Özkaynaklar"
                                />
                            </tbody>
                        </table>
                    </div>

                    {/* Karlılık Oranları */}
                    <div className="bg-surface-100 rounded-xl border border-gold-500/20 overflow-hidden">
                        <div className="bg-gold-500/10 border-b border-gold-500/20 px-4 py-3">
                            <h3 className="text-lg font-semibold text-gold-400 flex items-center gap-2">
                                <DollarSign className="w-5 h-5" />
                                Karlılık Oranları
                            </h3>
                        </div>
                        <table className="w-full">
                            <tbody>
                                <RatioRow
                                    label="Brüt Kar Marjı"
                                    value={formatPercent(data.profitability?.grossMargin || 0)}
                                    description="Brüt Kar / Satışlar"
                                />
                                <RatioRow
                                    label="Faaliyet Kar Marjı"
                                    value={formatPercent(data.profitability?.operatingMargin || 0)}
                                    description="Faaliyet Karı / Satışlar"
                                />
                                <RatioRow
                                    label="Net Kar Marjı"
                                    value={formatPercent(data.profitability?.netProfitMargin || 0)}
                                    description="Net Kar / Satışlar"
                                />
                                <RatioRow
                                    label="Özkaynak Karlılığı (ROE)"
                                    value={formatPercent(data.profitability?.roe || 0)}
                                    description="Net Kar / Özkaynaklar"
                                />
                                <RatioRow
                                    label="Aktif Karlılığı (ROA)"
                                    value={formatPercent(data.profitability?.roa || 0)}
                                    description="Net Kar / Toplam Varlıklar"
                                />
                            </tbody>
                        </table>
                    </div>

                    {/* Faaliyet Oranları */}
                    <div className="bg-surface-100 rounded-xl border border-blue-500/20 overflow-hidden">
                        <div className="bg-blue-500/10 border-b border-blue-500/20 px-4 py-3">
                            <h3 className="text-lg font-semibold text-blue-400 flex items-center gap-2">
                                <BarChart3 className="w-5 h-5" />
                                Faaliyet & Değerleme
                            </h3>
                        </div>
                        <table className="w-full">
                            <tbody>
                                <RatioRow
                                    label="Aktif Devir Hızı"
                                    value={formatRatio(data.efficiency?.assetTurnover || 0)}
                                    description="Satışlar / Toplam Varlıklar"
                                />
                                <RatioRow
                                    label="Özkaynak Devir Hızı"
                                    value={formatRatio(data.efficiency?.equityTurnover || 0)}
                                    description="Satışlar / Özkaynaklar"
                                />
                                <RatioRow
                                    label="FAVÖK Marjı"
                                    value={formatPercent(data.valuation?.ebitdaMargin || 0)}
                                    description="EBITDA / Satışlar"
                                />
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Bilgi Notu */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                <p className="text-blue-400 text-sm">
                    <strong>Not:</strong> Mali oranlar Yahoo Finance verileri üzerinden hesaplanmıştır.
                    Oranlar şirketin finansal sağlığını değerlendirmek için kullanılır.
                    Yüksek likidite iyi, yüksek borç oranı riskli, yüksek karlılık ise olumlu kabul edilir.
                </p>
            </div>
        </div>
    );
}
