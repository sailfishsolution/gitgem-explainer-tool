/** Background override for a frame range: 'none' hides the dot field for that span. */
export type BgSpec = {from: number; to: number; stars?: 'none' | 'dots'; fog?: boolean};