import { describe, expect, it } from "vitest";
import { lyricCapacity, validateSyncedLyrics } from "./lyrics";

describe("validateSyncedLyrics",()=>{
  it("acepta y normaliza una letra sincronizada",()=>expect(validateSyncedLyrics([{startTimeMs:100.4,words:" Hola "}],1000)).toEqual([{startTimeMs:100,words:"Hola"}]));
  it("rechaza tiempos desordenados",()=>expect(()=>validateSyncedLyrics([{startTimeMs:500,words:"a"},{startTimeMs:200,words:"b"}],1000)).toThrow(/desordenado/));
  it("rechaza líneas posteriores a la canción",()=>expect(()=>validateSyncedLyrics([{startTimeMs:7000,words:"a"}],1000)).toThrow(/después/));
  it("calcula un techo de puntuación dependiente del contenido",()=>expect(lyricCapacity([{startTimeMs:0,words:"abcd"}])).toEqual({characters:4,maximumScore:870}));
});
