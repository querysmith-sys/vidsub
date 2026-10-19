import assert from "node:assert/strict";
import test from "node:test";
import { buildSubtitleCues } from "./transcription.service";

test("keeps zero-duration real words at their original start inside the cue", () => {
    const cues = buildSubtitleCues([
        { text: "We", start: 1000, end: 1150 },
        { text: "actually", start: 1200, end: 1200 },
        { text: "agree.", start: 1250, end: 1500 }
    ]);

    assert.equal(cues.length, 1);
    assert.equal(cues[0].text, "We actually agree.");
    assert.equal(cues[0].start, 1000);
    assert.equal(cues[0].end, 1500);
    assert.equal(cues[0].firstWordStartMs, 1000);
    assert.deepEqual(cues[0].sourceWordStarts, [1000, 1200, 1250]);
});

test("attaches invalidly timed punctuation to the previous word without shifting its timing", () => {
    const cues = buildSubtitleCues([
        { text: "Hello", start: 1000, end: 1300 },
        { text: "?", start: Number.NaN, end: Number.NaN },
        { text: "there", start: 1400, end: 1700 }
    ]);

    assert.equal(cues.length, 2);
    assert.equal(cues[0].text, "Hello?");
    assert.equal(cues[0].start, 1000);
    assert.equal(cues[0].end, 1300);
    assert.equal(cues[1].start, 1400);
    assert.equal(cues[1].end, 1700);
});
