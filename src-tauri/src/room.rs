//! Télé de la salle « à la EasyWorship » : la fenêtre de projection d'OBS n'est PAS toujours au premier plan.
//! Une page étendue sur la télé (direct Facebook…) peut passer devant ; quand l'opérateur revient dans Regio,
//! Regio la fait repasser devant. « Masqué » : la fenêtre est cachée (rien de Regio sur la télé), sans être fermée.

/// Mot présent dans le titre des fenêtres de projection de Regio (scène projetée).
const ROOM_TITLE: &str = "Regio - Salle";

#[cfg(windows)]
mod win {
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextW, GetWindowThreadProcessId, SetWindowPos, ShowWindow, HWND_NOTOPMOST, HWND_TOPMOST,
        SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SW_HIDE, SW_SHOWNA,
    };

    struct Search {
        pid: u32,
        found: Vec<HWND>,
    }

    unsafe extern "system" fn visit(hwnd: HWND, data: LPARAM) -> BOOL {
        unsafe {
            let s = &mut *(data as *mut Search);
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if pid == s.pid {
                let mut buf = [0u16; 512];
                let n = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
                if n > 0 && String::from_utf16_lossy(&buf[..n as usize]).contains(super::ROOM_TITLE) {
                    s.found.push(hwnd);
                }
            }
        }
        1
    }

    /// Fenêtres de projection de la salle ouvertes par le moteur vidéo (processus `pid`).
    pub fn windows(pid: u32) -> Vec<HWND> {
        let mut s = Search { pid, found: Vec::new() };
        unsafe { EnumWindows(Some(visit), &mut s as *mut Search as LPARAM) };
        s.found
    }

    pub fn show(hwnd: HWND) {
        unsafe {
            ShowWindow(hwnd, SW_SHOWNA);
            // Passer devant tout, puis redevenir une fenêtre normale : une autre fenêtre pourra repasser devant.
            let flags = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE;
            SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, flags);
            SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, flags);
        }
    }

    pub fn hide(hwnd: HWND) {
        unsafe { ShowWindow(hwnd, SW_HIDE) };
    }
}

/// Affiche la projection par-dessus les autres fenêtres de la télé (`Some(true)`), la cache entièrement
/// (`Some(false)`), ou ne touche à rien (`None` : simple vérification). Renvoie le nombre de fenêtres trouvées.
#[cfg(windows)]
pub fn apply(pid: u32, shown: Option<bool>) -> usize {
    let list = win::windows(pid);
    for &h in &list {
        match shown {
            Some(true) => win::show(h),
            Some(false) => win::hide(h),
            None => {}
        }
    }
    list.len()
}

#[cfg(not(windows))]
pub fn apply(_pid: u32, _shown: Option<bool>) -> usize {
    0
}
