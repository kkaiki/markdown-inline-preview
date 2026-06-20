import type * as vscode from 'vscode';

import { registerOnDidChangeActiveEditor } from './onDidChangeActiveEditor';
import { registerOnDidChangeConfiguration } from './onDidChangeConfiguration';
import { registerOnDidChangeSelection } from './onDidChangeSelection';
import { registerOnDidChangeTextDocument } from './onDidChangeTextDocument';
import type { RawHandlerDeps } from './types';

export function registerRawListeners(
    context: vscode.ExtensionContext,
    deps: RawHandlerDeps
): void {
    registerOnDidChangeConfiguration(context, deps);
    registerOnDidChangeTextDocument(context, deps);
    registerOnDidChangeActiveEditor(context, deps);
    registerOnDidChangeSelection(context, deps);
}

export type { RawHandlerDeps } from './types';
