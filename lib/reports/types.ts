export type ReportColumn<Row> = {
  id: string;
  label: string;
  defaultOn: boolean;
  accessor: (row: Row) => string | number;
  numeric?: boolean;
};
