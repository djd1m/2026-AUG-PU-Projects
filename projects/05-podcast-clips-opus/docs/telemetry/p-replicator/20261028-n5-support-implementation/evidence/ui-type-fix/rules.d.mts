export function domRules(page: any, rules?: string[]): Promise<any>;
export function textZoomRule(page: any): Promise<any>;
/**
 * Portable public result type: do not infer a path into an overlaid axe-core installation.
 * @typedef {{ rule: string, axeRule: string, selector: string, severity: string,
 * impact: import('axe-core').ImpactValue | undefined, incomplete: boolean, message: string,
 * size: { width: number, height: number } | null }} AxeFinding
 */
/** @returns {Promise<AxeFinding[]>} */
export function axeRule(page: any): Promise<AxeFinding[]>;
export function lintCSS(source: any, filename: any): {
    rule: string;
    severity: string;
    selector: any;
    message: any;
    size: any;
}[];
export function firstScreenSelector(route: any): string | string[];
/** Все селекторы R9 маршрута списком; [] — маршрут без проверки первого экрана. */
export function firstScreenSelectors(route: any): string[];
export function firstScreenRule(page: any, selector: any): Promise<any>;
export const FIRST_SCREEN_VIEWPORTS: {
    w: number;
    h: number;
}[];
export const FIRST_SCREEN_ACTIONS: ({
    pattern: RegExp;
    selector: string[];
} | {
    pattern: RegExp;
    selector: string;
})[];
/**
 * Portable public result type: do not infer a path into an overlaid axe-core installation.
 */
export type AxeFinding = {
    rule: string;
    axeRule: string;
    selector: string;
    severity: string;
    impact: import("axe-core").ImpactValue | undefined;
    incomplete: boolean;
    message: string;
    size: {
        width: number;
        height: number;
    } | null;
};
