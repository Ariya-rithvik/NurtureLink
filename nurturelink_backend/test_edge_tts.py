"""Test Microsoft Edge TTS — free, no API key, natural neural voices."""
import asyncio
import edge_tts


async def list_english_voices():
    voices = await edge_tts.list_voices()
    english_female = [
        v for v in voices
        if v["Locale"].startswith("en-")
        and v["Gender"] == "Female"
    ]
    print(f"Found {len(english_female)} English female voices.\n")
    print(f"{'Name':<35} {'Locale':<10} {'Personality'}")
    print("-" * 80)
    for v in english_female[:20]:
        tags = v.get("VoiceTag", {})
        personality = ", ".join(tags.get("VoicePersonalities", []))
        print(f"{v['ShortName']:<35} {v['Locale']:<10} {personality}")


async def synthesize_demo():
    text = "Hello sweet baby. Mommy loves you very much."
    voice = "en-US-AvaNeural"
    out = "edge_tts_demo.mp3"

    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(out)
    print(f"\nGenerated: {out}")


async def main():
    await list_english_voices()
    print()
    print("Generating demo...")
    await synthesize_demo()


asyncio.run(main())
