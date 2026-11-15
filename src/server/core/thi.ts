/** Temperature-Humidity Index (NRC 1971), from daily max temperature °C and relative humidity %. */
export const thiOf = (tC: number, rh: number) => 1.8 * tC + 32 - (0.55 - 0.0055 * rh) * (1.8 * tC - 26);
