import { gql, useLazyQuery } from "@apollo/client";

const EXPORT_RECENT_TRANSACTIONS = gql`
    query export_transfers {
        export_transfers_csv(limit: 5000) {
            transfer_id
            block_number
            block_hash
            block_time
            from_address
            to_address
            amount_rev
            deployment_status
            deploy_id
            deployer
            deployment_type
            error_message
            errored
            transfer_status
            amount_dust
        }
    }
`;

const downloadExportData = (data: any) => {

    const blob = new Blob([], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.setAttribute("download", "transfers_report.csv");
    
    document.body.appendChild(link);
    
    link.click();
    
    document.body.removeChild(link);
};

const RecentTransactionsExporter = () => {
    const [
        getDataForExport,
        { data: dataForExport, loading: isExportDataLoading },
    ] = useLazyQuery(EXPORT_RECENT_TRANSACTIONS);

    if (isExportDataLoading) {
        return (
            <div className="recent-transactions-exporter">
                <div
                    className="loading"
                    style={{ width: "20px", height: "20px" }}
                />
            </div>
        );
    }
    
    const exportData = async () => {
        await getDataForExport();

        if (dataForExport) {
            downloadExportData(dataForExport);
        }
    }

    return (
        <div
            className="recent-transactions-exporter"
            onClick={exportData}
        >
            <svg
                width="20px"
                height="20px"
                viewBox="0 0 100 100"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M0 13.9693V95.424C0.0612529 97.8213 2.20518 99.9387 4.57647 100H86.0353C88.4198 99.9387 90.5505 97.8082 90.6118 95.424V44.8902L90.6161 44.8202H82.7932V44.829L81.2356 44.8246V90.6254H9.37236V18.7687H55.1068L55.1768 18.7731V9.38909L4.8221 9.38471C2.26254 9.38471 0.131271 11.423 0 13.9693ZM68.5423 0H95.1785C97.7774 0 99.9387 2.15682 100 4.58489V33.0263L98.4424 33.0219V33.0307H90.6195V16.0252L48.6261 58.0102L41.9888 51.3736L83.9822 9.38404H66.9752L66.9839 6.9425e-06L68.5415 0.00438125L68.5423 0Z"
                    fill="#7dbd61"
                />
            </svg>
        </div>
    );
};

export default RecentTransactionsExporter;
