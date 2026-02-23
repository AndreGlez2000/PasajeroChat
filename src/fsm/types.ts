export type StateName = 
    | 'menu'
    | 'aguardando_ruta'
    | 'aguardando_variante_violeta'
    | 'aguardando_variante_sitt'
    | 'aguardando_variante_suburbaja'
    | 'aguardando_parada'
    | 'consultando_ruta'
    | 'consultando_variante'
    | 'mostrando_resultados'
    | 'confirmando_avistamiento'
    | 'mostrando_mapas';

export interface UserState {
    state: StateName;
    data: {
        timestamp: number;
        ruta_id?: number;
        ruta_nombre?: string;
        variant_id?: number;
        variant_name?: string;
        stop_id?: number;
        stop_name?: string;
        last_reports?: any[];
    };
}