import { useState } from 'react';
import { Table, FileText, DollarSign, Activity, PieChart } from 'lucide-react';
import BalanceSheetTable from './BalanceSheetTable';
import IncomeStatementTable from './IncomeStatementTable';
import CashFlowTable from './CashFlowTable';
import RatiosTable from './RatiosTable';
import TradingViewFinancials from './TradingViewFinancials';

export default function FinancialTabs({ selectedSymbol }) {
    const [activeTab, setActiveTab] = useState('detailed'); // Varsayılan: TradingView

    const tabs = [
        { id: 'detailed', label: 'Resmi Veriler (Global)', icon: PieChart },
        { id: 'balance', label: 'Bilanço (Özet)', icon: Table },
        { id: 'income', label: 'Gelir Tablosu (Özet)', icon: FileText },
        { id: 'cashflow', label: 'Nakit Akım (Özet)', icon: DollarSign },
        { id: 'ratios', label: 'Mali Oranlar', icon: Activity }
    ];

    const renderContent = () => {
        // Sembolü alt bileşenlere de geçirebiliriz gerekirse, ama onlar search params'dan alıyor olabilir.
        // TradingView kesinlikle symbol'e ihtiyaç duyar.
        const symbol = selectedSymbol || 'THYAO.IS';

        switch (activeTab) {
            case 'balance':
                return <BalanceSheetTable />;
            case 'income':
                return <IncomeStatementTable />;
            case 'cashflow':
                return <CashFlowTable />;
            case 'ratios':
                return <RatiosTable />;
            case 'detailed':
                return <div className="bg-surface-100 rounded-xl p-4 border border-gold-500/20">
                    <TradingViewFinancials symbol={symbol} />
                </div>;
            default:
                return <BalanceSheetTable />;
        }
    };

    return (
        <div className="space-y-6">
            {/* Tabs Header */}
            <div className="bg-surface-100 rounded-xl p-2 border border-gold-500/20 overflow-x-auto">
                <div className="flex flex-nowrap md:flex-wrap gap-2 min-w-max md:min-w-0">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;

                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all whitespace-nowrap ${isActive
                                    ? 'bg-gradient-to-r from-gold-500 to-gold-600 text-dark-950 shadow-lg shadow-gold-500/20'
                                    : 'bg-surface-200 text-gray-400 hover:bg-surface-300 hover:text-white'
                                    }`}
                            >
                                <Icon className="w-5 h-5" />
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Tab Content */}
            <div className="animate-fadeIn">
                {renderContent()}
            </div>

            {/* Footer Info */}
            <div className="bg-surface-100 rounded-xl p-4 border border-gold-500/20">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-400">
                    <div>
                        <p><strong className="text-gold-400">Platform:</strong> Borsa Krali</p>
                        <p><strong className="text-gold-400">Tarih:</strong> 02 Şubat 2026</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <p><strong className="text-gold-400">Versiyon:</strong> 4.2</p>
                        <div className="px-3 py-1 bg-green-500/20 border border-green-500/30 rounded-lg">
                            <span className="text-green-400 font-semibold">● Production Ready</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
