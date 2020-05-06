export default class Process {
  public id: number;
  public shortName: string;
  public counter: number;

  constructor(id: number, fullName: string) {
    this.id = id;
    const [shortName, counter] = fullName.split('_');
    if (!shortName || !counter){
      console.error(
        `Error occurred when parsing process records: something went wrong.`,
      );
      process.exit(1);
    }
    this.shortName = shortName;
    this.counter = Number(counter);
  }
}
