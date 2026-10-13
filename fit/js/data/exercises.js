import chan from './ex-chan.js';
import thanTren from './ex-than-tren.js';
import coreNhay from './ex-core-nhay.js';
import nhanh from './ex-nhanh-thang-bang.js';
import gian from './ex-gian-co.js';

export const BAI_TAP = [...chan, ...thanTren, ...coreNhay, ...nhanh, ...gian];
export const BAI_THEO_ID = new Map(BAI_TAP.map((b) => [b.id, b]));
