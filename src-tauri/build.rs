fn main() {
    // Réintégrer l'icône dans l'exécutable quand elle change (sinon l'ancienne reste dans regio.exe).
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
