export function StartupScreen() {
    return (
        <div className="startup-screen" role="status" aria-live="polite" aria-busy="true">
            <div className="startup-screen__card">
                <p className="startup-screen__eyebrow">Pakti</p>
                <h1>Menyiapkan data aplikasi</h1>
                <p>
                    Memeriksa database pengguna, session, dan konfigurasi sebelum aplikasi dibuka.
                </p>
            </div>
        </div>
    )
}
