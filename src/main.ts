import { h, render } from 'preact';
import { App } from './ui/App';
import './ui/styles/tokens.css';
import './ui/styles/base.css';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) throw new Error('Missing #app element');

render(h(App, {}), root);
