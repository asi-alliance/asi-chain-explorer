import Papa from "papaparse";
import { DocumentNode, gql, useLazyQuery } from "@apollo/client";
import { ReactElement   , useEffect, useState } from "react";
import { Download } from "lucide-react";

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
            parent_links {
                parent_hash
                parent_index
            }
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
        token_decimals
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
    LABEL: string;
    TITLE: string;
}

const ExportEntitiesRecords: Record<ExportEntities, ExportEntitiesMeta> = {
    [ExportEntities.BLOCKS]: {
        GQL: EXPORT_RECENT_BLOCKS,
        EXPORT_DATA_KEY: "blocks",
        LABEL: "Export recent blocks as CSV",
        TITLE: "Download up to 5000 recent blocks as CSV",
    },
    [ExportEntities.DEPLOYMENTS]: {
        GQL: EXPORT_RECENT_DEPLOYMENTS,
        EXPORT_DATA_KEY: "deployments",
        LABEL: "Export recent deployments as CSV",
        TITLE: "Download up to 5000 recent deployments as CSV",
    },
    [ExportEntities.TRANSFERS]: {
        GQL: EXPORT_RECENT_TRANSFERS,
        EXPORT_DATA_KEY: "transfers",
        LABEL: "Export recent transfers as CSV",
        TITLE: "Download up to 5000 recent transfers as CSV",
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
        { data: dataForExport, loading: isExportDataLoading, error: exportError },
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

        // A failed request must not produce a file (or silently nothing).
        if (exportError) {
            setHasRequestedExport(false);
        } else if (dataForExport) {
            const EXPORT_DATA_KEY: string = ExportEntitiesRecords[entityToExport].EXPORT_DATA_KEY;
            let records = dataForExport[EXPORT_DATA_KEY];

            // Flatten DAG `parent_links` into a single `parent_hash` CSV column
            if (entityToExport === ExportEntities.BLOCKS) {
                records = (records || []).map((b: any) => {
                    const { parent_links, ...rest } = b;
                    return {
                        ...rest,
                        parent_hash: (parent_links || [])
                            .map((p: any) => p.parent_hash)
                            .join(";"),
                    };
                });
            }

            const csvData = convertDataArrayToCSV(records, EXCLUDE_FIELDS);
            if (csvData) {
                downloadExportData(csvData, EXPORT_DATA_KEY);
            }
            setHasRequestedExport(false); // Reset after download
        }

        setIsParsing(false);
    }, [dataForExport, exportError, isExportDataLoading, entityToExport, hasRequestedExport]);

    if (isExportDataLoading || isParsing) {
        return (
            <button
                type="button"
                className="recent-transactions-exporter"
                title="Preparing CSV export"
                aria-label={`Exporting ${entityToExport} as CSV`}
                disabled
            >
                <span className="loading" aria-hidden="true" />
                <span>CSV</span>
            </button>
        );
    }

    const meta = ExportEntitiesRecords[entityToExport];
    const label = exportError ? `Export failed: ${exportError.message}` : meta.LABEL;

    return (
        <button
            type="button"
            className="recent-transactions-exporter"
            title={exportError ? `Export failed: ${exportError.message}` : meta.TITLE}
            aria-label={label}
            onClick={() => {
                setHasRequestedExport(true);
                getDataForExport();
            }}
        >
            <Download size={15} aria-hidden="true" style={exportError ? { color: "#ef4444" } : undefined} />
            <span>{exportError ? "Retry CSV" : "Export CSV"}</span>
        </button>
    );
};

export default RecentDataExporter;
