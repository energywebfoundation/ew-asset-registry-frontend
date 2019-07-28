// Copyright 2018 Energy Web Foundation
// This file is part of the Origin Application brought to you by the Energy Web Foundation,
// a global non-profit organization focused on accelerating blockchain technology across the energy sector,
// incorporated in Zug, Switzerland.
//
// The Origin Application is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// This is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY and without an implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details, at <http://www.gnu.org/licenses/>.
//
// @authors: slock.it GmbH; Heiko Burkhardt, heiko.burkhardt@slock.it; Martin Kuechler, martin.kuchler@slock.it

import * as React from 'react';

import { Certificate, CertificateLogic } from 'ew-origin-lib';
import { User, Role } from 'ew-user-registry-lib';
import { Redirect } from 'react-router-dom';
import { Table, ITableHeaderData } from '../elements/Table/Table';
import TableUtils from '../elements/utils/TableUtils';
import { Configuration } from 'ew-utils-general-lib';
import { ProducingAsset } from 'ew-asset-registry-lib';
import { showNotification, NotificationType } from '../utils/notifications';
import { RequestIRECsModal } from '../elements/Modal/RequestIRECsModal';
import { PaginatedLoader, IPaginatedLoaderState, DEFAULT_PAGE_SIZE } from '../elements/Table/PaginatedLoader';

export interface ProducingAssetTableProps {
    conf: any;
    certificates: Certificate.Entity[];
    producingAssets: ProducingAsset.Entity[];
    currentUser: User;
    baseUrl: string;
    switchedToOrganization: boolean;
}

interface IProducingAssetTableState extends IPaginatedLoaderState {
    detailViewForAssetId: number;
    requestIRECsModalAsset: ProducingAsset.Entity;
    showRequestIRECsModal: boolean;
    switchedToOrganization: boolean;
}

export interface IEnrichedProducingAssetData {
    producingAsset: ProducingAsset.Entity;
    organizationName: string;
    notSoldCertificates: Certificate.Entity[];
}

enum OPERATIONS {
    REQUEST_IRECS = 'Request I-RECs',
    SHOW_DETAILS = 'Show Details'
}

export class ProducingAssetTable extends PaginatedLoader<ProducingAssetTableProps, IProducingAssetTableState> {    
    constructor(props: ProducingAssetTableProps) {
        super(props);

        this.state = {
            data: [],
            detailViewForAssetId: null,
            requestIRECsModalAsset: null,
            showRequestIRECsModal: false,
            switchedToOrganization: false,
            pageSize: DEFAULT_PAGE_SIZE,
            total: 0
        };

        this.switchToOrganization = this.switchToOrganization.bind(this);
        this.operationClicked = this.operationClicked.bind(this);
        this.hideRequestIRECsModal = this.hideRequestIRECsModal.bind(this);
    }

    switchToOrganization(switchedToOrganization: boolean): void {
        this.setState({
            switchedToOrganization
        });
    }

    async componentDidUpdate(newProps: ProducingAssetTableProps) {
        if (newProps.producingAssets !== this.props.producingAssets) {
            await this.loadPage(1);
        }
    }

    async enrichProducingAssetData(producingAssets: ProducingAsset.Entity[]): Promise<IEnrichedProducingAssetData[]> {
        const promises = producingAssets.map(
            async (producingAsset: ProducingAsset.Entity, index: number) => ({
                producingAsset,
                notSoldCertificates: this.props.certificates.filter(
                    (certificate: Certificate.Entity) =>
                        certificate.owner === producingAsset.owner.address &&
                        certificate.assetId.toString() === producingAsset.id
                ),
                organizationName: (await new User(
                    producingAsset.owner.address,
                    this.props.conf as any
                ).sync()).organization
            })
        );

        return Promise.all(promises);
    }

    operationClicked(key: string, id: number): void {
        switch (key) {
            case OPERATIONS.REQUEST_IRECS:
                this.requestIRECs(id);
                break;
            default:
                this.setState({
                    detailViewForAssetId: id
                });
                break;
        }
        
    }

    async requestIRECs(id: number) {
        const asset: ProducingAsset.Entity = this.props.producingAssets.find(
            (a: ProducingAsset.Entity) => a.id === id.toString()
        );
        
        let isOwner = asset.owner && asset.owner.address.toLowerCase() === this.props.currentUser.id.toLowerCase();
        if (!isOwner) {
            showNotification(`You need to own the asset to request I-RECs.`, NotificationType.Error);

            return;
        }

        let hasRights = this.props.currentUser.isRole(Role.AssetManager);
        if (!hasRights) {
            showNotification(`You need to have Asset Manager role to request I-RECs.`, NotificationType.Error);

            return;
        }

        const reads = await asset.getSmartMeterReads();

        if (reads.length === 0) {
            showNotification(`There are no smart meter reads for this asset.`, NotificationType.Error);

            return;
        }

        const certificateLogic : CertificateLogic = this.props.conf.blockchainProperties.certificateLogicInstance;

        const lastRequestedSMReadIndex = Number(await certificateLogic.getAssetRequestedCertsForSMReadsLength(Number(asset.id)));

        if (reads.length === lastRequestedSMReadIndex) {
            showNotification(`You have already requested certificates for all smart meter reads for this asset.`, NotificationType.Error);

            return;
        }

        asset.configuration.blockchainProperties.activeUser = {
            address: this.props.currentUser.id
        };

        this.setState({
            requestIRECsModalAsset: asset,
            showRequestIRECsModal: true
        });
    }

    hideRequestIRECsModal() {
        this.setState({
            requestIRECsModalAsset: null,
            showRequestIRECsModal: false
        });
    }

    async getPaginatedData({ pageSize, offset }) {
        const producingAssets: ProducingAsset.Entity[] = this.props.producingAssets.slice(offset, offset + pageSize);
        const enrichedProducingAssetData = await this.enrichProducingAssetData(producingAssets);
        const total = this.props.producingAssets.length;

        const filteredEnrichedAssetData = enrichedProducingAssetData.filter(
            (enrichedProducingAssetData: IEnrichedProducingAssetData) => {
                return (
                    !this.props.switchedToOrganization ||
                    enrichedProducingAssetData.producingAsset.owner.address ===
                        this.props.currentUser.id
                );
            }
        );

        const data = filteredEnrichedAssetData.map(
            (enrichedProducingAssetData: IEnrichedProducingAssetData) => {
                const producingAsset = enrichedProducingAssetData.producingAsset;

                return [
                    producingAsset.id,
                    enrichedProducingAssetData.organizationName,
                    producingAsset.offChainProperties.facilityName,
                    producingAsset.offChainProperties.region +
                        ', ' +
                        producingAsset.offChainProperties.country,
                    'Battery',
                    producingAsset.offChainProperties.capacityWh / 1000,
                    producingAsset.lastSmartMeterReadWh / 1000
                ];
            }
        );
        
        return {
            data,
            total
        };
    }

    render(): JSX.Element {
        if (this.state.detailViewForAssetId !== null) {
            return (
                <Redirect
                    push={true}
                    to={
                        '/' +
                        this.props.baseUrl +
                        '/assets/producing_detail_view/' +
                        this.state.detailViewForAssetId
                    }
                />
            );
        }

        const generateHeader = TableUtils.generateHeader;
        const generateFooter: any = TableUtils.generateFooter;

        const TableHeader: ITableHeaderData[] = [
            generateHeader('#', 60),
            generateHeader('Owner'),
            generateHeader('Facility Name'),
            generateHeader('Region, Country'),
            generateHeader('Type', 140),
            generateHeader('Nameplate Capacity (kW)', 125.45, true),
            generateHeader('Meter Read (kWh)', 135.89, true)
        ];

        const TableFooter: any = [
            {
                label: 'Total',
                key: 'total',
                colspan: 6
            },
            generateFooter('Meter Read (kWh)')
        ];

        const operations = [
            OPERATIONS.SHOW_DETAILS
        ];

        return (
            <div className="ProductionWrapper">
                <Table
                    header={TableHeader}
                    footer={TableFooter}
                    operationClicked={this.operationClicked}
                    actions={true}
                    data={this.state.data}
                    operations={operations}
                    loadPage={this.loadPage}
                    total={this.state.total}
                    pageSize={this.state.pageSize}
                />

                <RequestIRECsModal
                    conf={this.props.conf}
                    producingAsset={this.state.requestIRECsModalAsset}
                    showModal={this.state.showRequestIRECsModal}
                    callback={this.hideRequestIRECsModal}
                />
            </div>
        );
    }
}
