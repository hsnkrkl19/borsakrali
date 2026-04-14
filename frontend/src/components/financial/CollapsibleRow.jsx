import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

/**
 * Açılabilir Tablo Satırı Component
 * Finansal tablolarda kategorileri göster/gizle için
 */
export default function CollapsibleRow({
    title,
    value,
    columns = [],
    children,
    defaultOpen = false,
    level = 0,
    highlight = false
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    const indent = level * 24; // Her seviye için 24px girinti

    // Başlık satırı rengi
    const bgColor = highlight
        ? 'bg-gold-500/10 hover:bg-gold-500/20'
        : level === 0
            ? 'bg-surface-200 hover:bg-surface-300'
            : 'bg-surface-100 hover:bg-surface-200';

    return (
        <>
            {/* Ana Satır */}
            <tr
                onClick={() => setIsOpen(!isOpen)}
                className={`${bgColor} cursor-pointer transition-colors border-b border-surface-300`}
            >
                <td className="px-4 py-3 text-white font-medium" style={{ paddingLeft: `${indent + 16}px` }}>
                    <div className="flex items-center gap-2">
                        {children ? (
                            isOpen ? (
                                <ChevronDown className="w-4 h-4 text-gold-400" />
                            ) : (
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                            )
                        ) : (
                            <span className="w-4" />
                        )}
                        <span className={highlight ? 'text-gold-400 font-bold' : ''}>{title}</span>
                    </div>
                </td>
                {columns.map((col, idx) => (
                    <td
                        key={idx}
                        className={`px-4 py-3 text-right font-mono ${highlight ? 'text-gold-400 font-bold' : 'text-gray-300'
                            }`}
                    >
                        {col}
                    </td>
                ))}
            </tr>

            {/* Alt Satırlar (Açıldığında) */}
            {isOpen && children && (
                <tr>
                    <td colSpan={columns.length + 1} className="p-0">
                        <table className="w-full table-min-wide">
                            <tbody>
                                {children}
                            </tbody>
                        </table>
                    </td>
                </tr>
            )}
        </>
    );
}

/**
 * Basit Tablo Satırı (Açılmaz)
 */
export function TableRow({ title, columns = [], level = 1, bold = false }) {
    const indent = level * 24;

    return (
        <tr className="border-b border-surface-300 hover:bg-surface-100 transition-colors">
            <td
                className={`px-4 py-2 ${bold ? 'text-white font-semibold' : 'text-gray-400'}`}
                style={{ paddingLeft: `${indent + 16}px` }}
            >
                {title}
            </td>
            {columns.map((col, idx) => (
                <td
                    key={idx}
                    className={`px-4 py-2 text-right font-mono ${bold ? 'text-white font-semibold' : 'text-gray-300'
                        }`}
                >
                    {col}
                </td>
            ))}
        </tr>
    );
}
