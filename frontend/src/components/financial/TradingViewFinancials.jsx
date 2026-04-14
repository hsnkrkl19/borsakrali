import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { getTradingViewTheme } from '../../utils/theme';

/**
 * TradingViewFinancials — Bilanço, Gelir Tablosu, Nakit Akışı Widget
 *
 * Container tamamen sıfırlanır → __widget div yeniden yaratılır
 * → TradingView temiz başlatılır.
 */
export default function TradingViewFinancials({ symbol: initialSymbol }) {
    const [symbol, setSymbol]       = useState(initialSymbol || 'THYAO');
    const [inputValue, setInputValue] = useState(initialSymbol || 'THYAO');
    const containerRef = useRef(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Sıfırla ve __widget div yeniden yarat
        container.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';

        // Sembol formatla: BIST:THYAO
        let tvSymbol = symbol.toUpperCase().trim().replace('.IS', '');
        if (!tvSymbol.includes(':')) tvSymbol = `BIST:${tvSymbol}`;

        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-financials.js';
        script.async = true;
        script.textContent = JSON.stringify({
            isTransparent: true,
            largeChartUrl: '',
            displayMode: 'regular',
            width: '100%',
            height: '1100',
            colorTheme: getTradingViewTheme(),
            symbol: tvSymbol,
            locale: 'tr'
        });

        container.appendChild(script);

        return () => {
            try { container.innerHTML = ''; } catch {}
        };
    }, [symbol]);

    const handleSearch = (e) => {
        e.preventDefault();
        if (inputValue.trim()) setSymbol(inputValue.trim());
    };

    return (
        <div className="flex flex-col gap-4">
            {/* Arama */}
            <form onSubmit={handleSearch} className="flex gap-2 max-w-md">
                <div className="relative flex-1">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value.toUpperCase())}
                        placeholder="Hisse ara (örn: GARAN)..."
                        className="w-full bg-dark-900 border border-gold-500/20 rounded-lg px-4 py-2 pl-10 text-white focus:outline-none focus:border-gold-500/50"
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
                <button
                    type="submit"
                    className="bg-gold-500 text-dark-950 px-4 py-2 rounded-lg font-bold hover:bg-gold-400 transition-colors"
                >
                    Getir
                </button>
            </form>

            {/* Widget Container — hook innerHTML ile __widget div'i kendisi yaratır */}
            <div
                ref={containerRef}
                className="tradingview-widget-container"
                style={{ minHeight: '1100px', width: '100%' }}
            />
        </div>
    );
}
