import Papa from "papaparse";
import { DocumentNode, gql, useLazyQuery } from "@apollo/client";
import { ReactElement   , useEffect, useState } from "react";

const EXCLUDE_FIELDS = ["__typename"];

const EXPORT_RECENT_BLOCKS = gql`
    query GetBlocksForCSV {
        blocks(limit: 5000) {
            block_number
            timestamp
            block_hash
            created_at
            deployment_count
            extra_bytes
            fault_tolerance
            finalization_status
            parent_hash
            pre_state_hash
            proposer
            seq_num
            shard_id
            sig
            sig_algorithm
            state_hash
            state_root_hash
            version
        }
}
`;

const EXPORT_RECENT_DEPLOYMENTS = gql`
query GetDeploymentsCSV {
    deployments(limit: 5000) {
        deploy_id
        block_number
        timestamp
        block_hash
        created_at
        seq_num
        shard_id
        sig
        sig_algorithm
        deployer
        deployment_type
        phlo_cost
        phlo_limit
        phlo_price
        status
        valid_after_block_number
        errored
        error_message
    }
}
`;

const EXPORT_RECENT_TRANSFERS = gql`
query GetTransfersCSV {
    transfers(limit: 5000) {
        id
        deploy_id
        block_number
        timestamp
        created_at
        status
        amount_asi
        amount_dust
        from_address
        from_public_key
        to_address
    }
}
`;

export const enum ExportEntities {
    BLOCKS = 'blocks',
    DEPLOYMENTS = 'deployments',
    TRANSFERS = 'transfers'
}

export interface ExportEntitiesMeta {
    GQL: DocumentNode,
    EXPORT_DATA_KEY: string;
}

const ExportEntitiesRecords: Record<ExportEntities, ExportEntitiesMeta> = {
    [ExportEntities.BLOCKS]: {
        GQL: EXPORT_RECENT_BLOCKS,
        EXPORT_DATA_KEY: "blocks",
    },
    [ExportEntities.DEPLOYMENTS]: {
        GQL: EXPORT_RECENT_DEPLOYMENTS,
        EXPORT_DATA_KEY: "deployments",
    },
    [ExportEntities.TRANSFERS]: {
        GQL: EXPORT_RECENT_TRANSFERS,
        EXPORT_DATA_KEY: "transfers",
    },
};

const downloadExportData = (data: any, name: string): void => {
    const blob = new Blob(["\uFEFF", data], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.setAttribute("download", `recent_${name}.csv`);

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);
};

const convertDataArrayToCSV = (data: object[], exclude: string[]): string | null => {
    if (!data?.length) {
        return null;
    }

    const fields = Object.keys(data[0]).filter(k => !exclude.includes(k));

    return Papa.unparse({fields, data}, {header: true}); // data, { header: true}
};

export interface RecentDataExporterProps {
    entityToExport: ExportEntities;
};


const RecentDataExporter = ({entityToExport}: RecentDataExporterProps): ReactElement => {

    const [
        getDataForExport,
        { data: dataForExport, loading: isExportDataLoading },
    ] = useLazyQuery(ExportEntitiesRecords[entityToExport].GQL);

    const [isParsing, setIsParsing] = useState(false);
    const [hasRequestedExport, setHasRequestedExport] = useState(false);
    
    // Reset export state when entityToExport changes
    useEffect(() => {
        setHasRequestedExport(false);
    }, [entityToExport]);

    useEffect(() => {
        if (!hasRequestedExport) {
            return;
        };
        
        setIsParsing(true);

        if (isExportDataLoading) {
            return;
        }

        if (dataForExport) {
            const EXPORT_DATA_KEY: string = ExportEntitiesRecords[entityToExport].EXPORT_DATA_KEY;
            const csvData = convertDataArrayToCSV(dataForExport[EXPORT_DATA_KEY], EXCLUDE_FIELDS);
            if (csvData) {
                downloadExportData(csvData, EXPORT_DATA_KEY);
            }
            setHasRequestedExport(false); // Reset after download
        }

        setIsParsing(false);
    }, [dataForExport, isExportDataLoading, entityToExport, hasRequestedExport]);

    if (isExportDataLoading || isParsing) {
        return (
            <div className="recent-transactions-exporter" title="Exporting...">
                <div
                    className="loading"
                    style={{ width: "20px", height: "20px" }}
                />
            </div>
        );
    }

    return (
        <div
            className="recent-transactions-exporter"
            title="Export recent transactions"
            onClick={() => {
                setHasRequestedExport(true);
                getDataForExport();
            }}
        >
            <svg
                width="20px"
                height="20px"
                viewBox="0 0 100 100"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M0 13.9693V95.424C0.0612529 97.8213 2.20518 99.9387 4.57647 100H86.0353C88.4198 99.9387 90.5505 97.8082 90.6118 95.424V44.8902L90.6161 44.8202H82.7932V44.829L81.2356 44.8246V90.6254H9.37236V18.7687H55.1068L55.1768 18.7731V9.38909L4.8221 9.38471C2.26254 9.38471 0.131271 11.423 0 13.9693ZM68.5423 0H95.1785C97.7774 0 99.9387 2.15682 100 4.58489V33.0263L98.4424 33.0219V33.0307H90.6195V16.0252L48.6261 58.0102L41.9888 51.3736L83.9822 9.38404H66.9752L66.9839 6.9425e-06L68.5415 0.00438125L68.5423 0Z"
                    fill="#7dbd61"
                />
            </svg>
        </div>
    );
};

export default RecentDataExporter;
