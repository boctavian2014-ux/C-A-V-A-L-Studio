import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

// Must run before any Editor component import chain initializes @monaco-editor/loader.
loader.config({ monaco });
