import * as vscode from 'vscode';

export type HeadingColorScheme = 'default' | 'monochrome' | 'vibrant';

interface HeadingStyle {
    fontWeight: string;
    color: string;
    backgroundColor: string;
    border: string;
}

const SCHEMES: Record<HeadingColorScheme, HeadingStyle[]> = {
    default: [
        { fontWeight: '900', color: '#e06c75', backgroundColor: 'rgba(224,108,117,0.06)', border: '1px solid rgba(224,108,117,0.30)' },
        { fontWeight: '800', color: '#d19a66', backgroundColor: 'rgba(209,154,102,0.06)', border: '1px solid rgba(209,154,102,0.30)' },
        { fontWeight: '800', color: '#e5c07b', backgroundColor: 'rgba(229,192,123,0.06)', border: '1px solid rgba(229,192,123,0.30)' },
        { fontWeight: '700', color: '#98c379', backgroundColor: 'rgba(152,195,121,0.06)', border: '1px solid rgba(152,195,121,0.30)' },
        { fontWeight: '700', color: '#56b6c2', backgroundColor: 'rgba(86,182,194,0.06)', border: '1px solid rgba(86,182,194,0.30)' },
        { fontWeight: '700', color: '#61afef', backgroundColor: 'rgba(97,175,239,0.06)', border: '1px solid rgba(97,175,239,0.30)' }
    ],
    monochrome: [
        { fontWeight: '900', color: '#f0f0f0', backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.22)' },
        { fontWeight: '800', color: '#d8d8d8', backgroundColor: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.20)' },
        { fontWeight: '800', color: '#c0c0c0', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.18)' },
        { fontWeight: '700', color: '#a8a8a8', backgroundColor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.16)' },
        { fontWeight: '700', color: '#909090', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.14)' },
        { fontWeight: '700', color: '#787878', backgroundColor: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.12)' }
    ],
    vibrant: [
        { fontWeight: '900', color: '#ff6b6b', backgroundColor: 'rgba(255,107,107,0.10)', border: '1px solid rgba(255,107,107,0.45)' },
        { fontWeight: '800', color: '#ffa94d', backgroundColor: 'rgba(255,169,77,0.10)', border: '1px solid rgba(255,169,77,0.45)' },
        { fontWeight: '800', color: '#ffd43b', backgroundColor: 'rgba(255,212,59,0.10)', border: '1px solid rgba(255,212,59,0.45)' },
        { fontWeight: '700', color: '#69db7c', backgroundColor: 'rgba(105,219,124,0.10)', border: '1px solid rgba(105,219,124,0.45)' },
        { fontWeight: '700', color: '#4dabf7', backgroundColor: 'rgba(77,171,247,0.10)', border: '1px solid rgba(77,171,247,0.45)' },
        { fontWeight: '700', color: '#da77f2', backgroundColor: 'rgba(218,119,242,0.10)', border: '1px solid rgba(218,119,242,0.45)' }
    ]
};

export function createHeadingDecorations(scheme: HeadingColorScheme): vscode.TextEditorDecorationType[] {
    const styles = SCHEMES[scheme] ?? SCHEMES.default;
    return styles.map(style =>
        vscode.window.createTextEditorDecorationType({
            fontWeight: style.fontWeight,
            color: style.color,
            backgroundColor: style.backgroundColor,
            border: style.border,
            borderRadius: '3px',
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        })
    );
}

export function resolveHeadingColorScheme(config: vscode.WorkspaceConfiguration): HeadingColorScheme {
    const value = config.get<string>('headingColorScheme', 'default');
    if (value === 'monochrome' || value === 'vibrant') return value;
    return 'default';
}
