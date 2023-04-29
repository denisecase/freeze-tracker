function getProcessedFilePath(fname) {
  const basePath = window.location.href.includes("localhost")
    ? "/root"
    : "https://denisecase.github.io/freeze-tracker";
  const processedFilePath = `${basePath}/data/2_processed/${fname}`;
  console.log(`Reading from file ${processedFilePath}`);
  return processedFilePath;
}
