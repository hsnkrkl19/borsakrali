import FinancialTabs from '../components/financial/FinancialTabs';

export default function FinancialAnalysis() {
    return (
        <div className="min-h-screen bg-dark-950 p-4 md:p-6">
            <div className="mb-6">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-gold-400 to-gold-600 bg-clip-text text-transparent mb-2">
                    Mali Tablolar
                </h1>
                <p className="text-gray-400">
                    Bilanço, Gelir Tablosu, Nakit Akım ve Mali Oranlar - Tüm finansal veriler tek sayfada
                </p>
            </div>
            <FinancialTabs />
        </div>
    );
}
