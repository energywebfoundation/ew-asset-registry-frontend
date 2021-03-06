import { Component, ReactText } from 'react';
import { ICustomFilter } from './FiltersHeader';

export const DEFAULT_PAGE_SIZE = 25;

export type IPaginatedLoaderProps = any;

export interface IPaginatedLoaderState {
    paginatedData: any[];
    formattedPaginatedData: ReactText[][];
    pageSize: number;
    total: number;
}

export interface IPaginatedLoaderFetchDataParameters {
    pageSize: number;
    offset: number;
    filters?: ICustomFilter[];
}

export interface IPaginatedLoaderFetchDataReturnValues {
    paginatedData: any[];
    formattedPaginatedData: ReactText[][];
    total: number;
}

export interface IPaginatedLoader {
    getPaginatedData({ pageSize, offset, filters }: IPaginatedLoaderFetchDataParameters) : Promise<IPaginatedLoaderFetchDataReturnValues>
}

export const PAGINATED_LOADER_INITIAL_STATE: IPaginatedLoaderState = {
    paginatedData: [],
    formattedPaginatedData: [],
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0
};

export function getInitialPaginatedLoaderState(): IPaginatedLoaderState {
    return JSON.parse(JSON.stringify(PAGINATED_LOADER_INITIAL_STATE));
}

export abstract class PaginatedLoader<Props extends IPaginatedLoaderProps, State extends IPaginatedLoaderState> extends Component<Props, State> implements IPaginatedLoader {
    protected _isMounted: boolean = false;

    constructor(props: Props) {
        super(props);

        this.loadPage = this.loadPage.bind(this);
    }

    async componentDidMount() {
        this._isMounted = true;

        await this.loadPage(1);
    }

    componentWillUnmount() {
        this._isMounted = false;
    }

    abstract getPaginatedData({ pageSize, offset, filters }: IPaginatedLoaderFetchDataParameters): Promise<IPaginatedLoaderFetchDataReturnValues>

    async loadPage(page: number, filters?: ICustomFilter[]) {
        const {
            pageSize
        } = this.state;

        const offset = (page - 1) * pageSize;

        const {
            paginatedData,
            formattedPaginatedData,
            total
        } = await this.getPaginatedData({
            pageSize,
            offset,
            filters
        });

        if (!this._isMounted) {
          return;
        }

        this.setState({
            paginatedData,
            formattedPaginatedData,
            total
        });
    }
}
