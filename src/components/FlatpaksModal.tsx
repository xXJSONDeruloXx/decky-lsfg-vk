import { FC, useState, useEffect, CSSProperties } from 'react';
import {
  ModalRoot,
  DialogBody,
  DialogHeader,
  DialogControlsSection,
  DialogControlsSectionHeader,
  ButtonItem,
  PanelSectionRow,
  Field,
  Toggle,
  Spinner,
  Focusable,
  showModal,
  ConfirmModal
} from '@decky/ui';
import { FaCheck, FaTimes, FaDownload, FaTrash, FaCog } from 'react-icons/fa';
import flatpakTargetImage from '../../assets/flatpak-target.png';
import { 
  checkFlatpakExtensionStatus, 
  installFlatpakExtension, 
  uninstallFlatpakExtension,
  getFlatpakApps,
  setFlatpakAppOverride,
  removeFlatpakAppOverride,
  FlatpakExtensionStatus,
  FlatpakApp,
  FlatpakAppInfo
} from '../api/lsfgApi';
import t from '../i18n/i18n';

interface FlatpaksModalProps {
  closeModal?: () => void;
}

export const FlatpaksModal: FC<FlatpaksModalProps> = ({ closeModal }) => {
  const [extensionStatus, setExtensionStatus] = useState<FlatpakExtensionStatus | null>(null);
  const [flatpakApps, setFlatpakApps] = useState<FlatpakAppInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [operationInProgress, setOperationInProgress] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statusResult, appsResult] = await Promise.all([
        checkFlatpakExtensionStatus(),
        getFlatpakApps()
      ]);

      setExtensionStatus(statusResult);
      setFlatpakApps(appsResult);
    } catch (error) {
      console.error('Error loading Flatpak data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleExtensionOperation = async (operation: 'install' | 'uninstall', version: string) => {
    const operationId = `${operation}-${version}`;
    setOperationInProgress(operationId);

    try {
      const result = operation === 'install' 
        ? await installFlatpakExtension(version)
        : await uninstallFlatpakExtension(version);

      if (result.success) {
        // Reload status after operation
        const newStatus = await checkFlatpakExtensionStatus();
        setExtensionStatus(newStatus);
      }
    } catch (error) {
      console.error(`Error ${operation}ing extension:`, error);
    } finally {
      setOperationInProgress(null);
    }
  };

  const handleAppOverrideToggle = async (app: FlatpakApp) => {
    const hasOverrides = app.has_filesystem_override && app.has_env_override;
    const operationId = `app-${app.app_id}`;
    setOperationInProgress(operationId);

    try {
      const result = hasOverrides 
        ? await removeFlatpakAppOverride(app.app_id)
        : await setFlatpakAppOverride(app.app_id);

      if (result.success) {
        // Reload apps data after operation
        const newApps = await getFlatpakApps();
        setFlatpakApps(newApps);
      }
    } catch (error) {
      console.error('Error toggling app override:', error);
    } finally {
      setOperationInProgress(null);
    }
  };

  const confirmOperation = (operation: () => void, title: string, description: string) => {
    showModal(
      <ConfirmModal
        strTitle={title}
        strDescription={description}
        onOK={operation}
        onCancel={() => {}}
      />
    );
  };

  if (loading) {
    return (
      <ModalRoot closeModal={closeModal}>
        <DialogHeader>{t('FLATPAK_MODAL_TITLE', 'Flatpak Extensions')}</DialogHeader>
        <DialogBody>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
            <Spinner />
          </div>
        </DialogBody>
      </ModalRoot>
    );
  }

  const instructionSteps = [
    {
      id: 'try-first',
      title: t('FLATPAK_STEP_TRY_FIRST', 'Try first:'),
      command: '~/lsfg'
    },
    {
      id: 'try-full-path',
      title: t('FLATPAK_STEP_TRY_FULL_PATH', "If that doesn't work, try full path:"),
      command: '/home/(username)/lsfg'
    },
    {
      id: 'final-result',
      title: t('FLATPAK_STEP_FINAL', 'Final result should look like:'),
      command: '~/lsfg "usr/bin/flatpak"'
    }
  ];

  const focusableInstructionStyle: CSSProperties = {
    padding: '10px',
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '6px',
    marginBottom: '12px'
  };

  const commandStyle: CSSProperties = {
    fontFamily: 'monospace',
    fontSize: '0.85em',
    background: 'rgba(0, 0, 0, 0.45)',
    padding: '8px',
    borderRadius: '4px',
    marginTop: '6px'
  };

  return (
    <ModalRoot closeModal={closeModal}>
      <DialogHeader>{t('FLATPAK_MODAL_TITLE', 'Flatpak Extensions')}</DialogHeader>
      <DialogBody>
        <Focusable>
          {/* Extension Status Section */}
          <DialogControlsSection>
            <DialogControlsSectionHeader>{t('FLATPAK_RUNTIME_INSTALLER', 'Runtime Extension Installer')}</DialogControlsSectionHeader>

            {extensionStatus && extensionStatus.success ? (
              <>
                {/* 23.08 Runtime */}
                <PanelSectionRow>
                  <Field
                    label={t('FLATPAK_RUNTIME_23', 'Runtime 23.08')}
                    description={extensionStatus.installed_23_08 ? t('FLATPAK_INSTALLED', 'Installed') : t('FLATPAK_NOT_INSTALLED', 'Not installed')}
                    icon={extensionStatus.installed_23_08 ? <FaCheck style={{color: 'green'}} /> : <FaTimes style={{color: 'red'}} />}
                  >
                    <ButtonItem
                      layout="below"
                      onClick={() => {
                        const operation = extensionStatus.installed_23_08 ? 'uninstall' : 'install';
                        const action = () => handleExtensionOperation(operation, '23.08');

                        if (operation === 'uninstall') {
                          confirmOperation(
                            action,
                            t('FLATPAK_UNINSTALL_TITLE', 'Uninstall Runtime Extension'),
                            `${t('FLATPAK_UNINSTALL_CONFIRM_PREFIX', 'Are you sure you want to uninstall the')} 23.08 ${t('FLATPAK_UNINSTALL_CONFIRM_SUFFIX', 'runtime extension?')}`
                          );
                        } else {
                          action();
                        }
                      }}
                      disabled={operationInProgress === 'install-23.08' || operationInProgress === 'uninstall-23.08'}
                    >
                      {operationInProgress === 'install-23.08' || operationInProgress === 'uninstall-23.08' ? (
                        <Spinner />
                      ) : extensionStatus.installed_23_08 ? (
                        <>
                          <FaTrash /> {t('FLATPAK_UNINSTALL_BTN', 'Uninstall')}
                        </>
                      ) : (
                        <>
                          <FaDownload /> {t('FLATPAK_INSTALL_BTN', 'Install')}
                        </>
                      )}
                    </ButtonItem>
                  </Field>
                </PanelSectionRow>

                {/* 24.08 Runtime */}
                <PanelSectionRow>
                  <Field
                    label={t('FLATPAK_RUNTIME_24', 'Runtime 24.08')}
                    description={extensionStatus.installed_24_08 ? t('FLATPAK_INSTALLED', 'Installed') : t('FLATPAK_NOT_INSTALLED', 'Not installed')}
                    icon={extensionStatus.installed_24_08 ? <FaCheck style={{color: 'green'}} /> : <FaTimes style={{color: 'red'}} />}
                  >
                    <ButtonItem
                      layout="below"
                      onClick={() => {
                        const operation = extensionStatus.installed_24_08 ? 'uninstall' : 'install';
                        const action = () => handleExtensionOperation(operation, '24.08');

                        if (operation === 'uninstall') {
                          confirmOperation(
                            action,
                            t('FLATPAK_UNINSTALL_TITLE', 'Uninstall Runtime Extension'),
                            `${t('FLATPAK_UNINSTALL_CONFIRM_PREFIX', 'Are you sure you want to uninstall the')} 24.08 ${t('FLATPAK_UNINSTALL_CONFIRM_SUFFIX', 'runtime extension?')}`
                          );
                        } else {
                          action();
                        }
                      }}
                      disabled={operationInProgress === 'install-24.08' || operationInProgress === 'uninstall-24.08'}
                    >
                      {operationInProgress === 'install-24.08' || operationInProgress === 'uninstall-24.08' ? (
                        <Spinner />
                      ) : extensionStatus.installed_24_08 ? (
                        <>
                          <FaTrash /> {t('FLATPAK_UNINSTALL_BTN', 'Uninstall')}
                        </>
                      ) : (
                        <>
                          <FaDownload /> {t('FLATPAK_INSTALL_BTN', 'Install')}
                        </>
                      )}
                    </ButtonItem>
                  </Field>
                </PanelSectionRow>

                {/* 25.08 Runtime */}
                <PanelSectionRow>
                  <Field
                    label={t('FLATPAK_RUNTIME_25', 'Runtime 25.08')}
                    description={extensionStatus.installed_25_08 ? t('FLATPAK_INSTALLED', 'Installed') : t('FLATPAK_NOT_INSTALLED', 'Not installed')}
                    icon={extensionStatus.installed_25_08 ? <FaCheck style={{color: 'green'}} /> : <FaTimes style={{color: 'red'}} />}
                  >
                    <ButtonItem
                      layout="below"
                      onClick={() => {
                        const operation = extensionStatus.installed_25_08 ? 'uninstall' : 'install';
                        const action = () => handleExtensionOperation(operation, '25.08');

                        if (operation === 'uninstall') {
                          confirmOperation(
                            action,
                            t('FLATPAK_UNINSTALL_TITLE', 'Uninstall Runtime Extension'),
                            `${t('FLATPAK_UNINSTALL_CONFIRM_PREFIX', 'Are you sure you want to uninstall the')} 25.08 ${t('FLATPAK_UNINSTALL_CONFIRM_SUFFIX', 'runtime extension?')}`
                          );
                        } else {
                          action();
                        }
                      }}
                      disabled={operationInProgress === 'install-25.08' || operationInProgress === 'uninstall-25.08'}
                    >
                      {operationInProgress === 'install-25.08' || operationInProgress === 'uninstall-25.08' ? (
                        <Spinner />
                      ) : extensionStatus.installed_25_08 ? (
                        <>
                          <FaTrash /> {t('FLATPAK_UNINSTALL_BTN', 'Uninstall')}
                        </>
                      ) : (
                        <>
                          <FaDownload /> {t('FLATPAK_INSTALL_BTN', 'Install')}
                        </>
                      )}
                    </ButtonItem>
                  </Field>
                </PanelSectionRow>
              </>
            ) : (
              <PanelSectionRow>
                <Field
                  label={t('FLATPAK_ERROR', 'Error')}
                  description={extensionStatus?.error || t('FLATPAK_ERROR_STATUS', 'Failed to check extension status')}
                  icon={<FaTimes style={{color: 'red'}} />}
                />
              </PanelSectionRow>
            )}
          </DialogControlsSection>

          {/* Flatpak Apps Section */}
          <DialogControlsSection>
            <DialogControlsSectionHeader>{t('FLATPAK_APPS_TITLE', 'Flatpak Applications')}</DialogControlsSectionHeader>

            {flatpakApps && flatpakApps.success ? (
              flatpakApps.apps.length > 0 ? (
                flatpakApps.apps.map((app) => {
                  const hasOverrides = app.has_filesystem_override && app.has_env_override;
                  const partialOverrides = app.has_filesystem_override || app.has_env_override;

                  let statusColor = 'red';
                  let statusText = t('FLATPAK_STATUS_NO_OVERRIDES', 'No overrides');

                  if (hasOverrides) {
                    statusColor = 'green';
                    statusText = t('FLATPAK_STATUS_CONFIGURED', 'Configured');
                  } else if (partialOverrides) {
                    statusColor = 'orange';
                    statusText = t('FLATPAK_STATUS_PARTIAL', 'Partial');
                  }

                  return (
                    <PanelSectionRow key={app.app_id}>
                      <Field 
                        label={app.app_name || app.app_id}
                        description={`${app.app_id} - ${statusText}`}
                        icon={<FaCog style={{color: statusColor}} />}
                      >
                        <Toggle
                          value={hasOverrides}
                          onChange={() => handleAppOverrideToggle(app)}
                          disabled={operationInProgress === `app-${app.app_id}`}
                        />
                      </Field>
                    </PanelSectionRow>
                  );
                })
              ) : (
                <PanelSectionRow>
                  <Field
                    label={t('FLATPAK_NO_APPS', 'No Flatpak Apps Found')}
                    description={t('FLATPAK_NO_APPS_DESC', 'No Flatpak applications are currently installed')}
                  />
                </PanelSectionRow>
              )
            ) : (
              <PanelSectionRow>
                <Field
                  label={t('FLATPAK_ERROR', 'Error')}
                  description={flatpakApps?.error || t('FLATPAK_ERROR_APPS', 'Failed to load Flatpak applications')}
                  icon={<FaTimes style={{color: 'red'}} />}
                />
              </PanelSectionRow>
            )}
          </DialogControlsSection>

          {/* Steam Configuration Instructions */}
          <DialogControlsSection>
            <DialogControlsSectionHeader>{t('FLATPAK_STEAM_CONFIG_TITLE', 'Steam Configuration')}</DialogControlsSectionHeader>
            <div
              style={{
                padding: '12px',
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                margin: '8px 0',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#fff' }}>
                {t('FLATPAK_STEAM_CONFIG_HEADER', 'Configure Steam Flatpak Shortcuts')}
              </div>
              <div style={{ fontSize: '0.9em', lineHeight: '1.4', marginBottom: '8px' }}>
                {t('FLATPAK_STEAM_CONFIG_DESC', 'In Steam, open your flatpak game and click the cog wheel.')}
              </div>
              <div style={{ fontSize: '0.9em', lineHeight: '1.4', marginBottom: '12px', color: '#ffa500' }}>
                <strong>IMPORTANT:</strong> {t('FLATPAK_STEAM_CONFIG_IMPORTANT', 'Set this in TARGET (NOT LAUNCH OPTIONS)')}
              </div>

              {instructionSteps.map((step) => (
                <Focusable
                  key={step.id}
                  focusWithinClassName="gpfocuswithin"
                  onActivate={() => {}}
                  style={focusableInstructionStyle}
                >
                  <div style={{ fontWeight: 'bold' }}>{step.title}</div>
                  <div style={commandStyle}>{step.command}</div>
                </Focusable>
              ))}

              <Focusable
                focusWithinClassName="gpfocuswithin"
                onActivate={() => {}}
                style={{ marginTop: '4px' }}
              >
                <div style={{ textAlign: 'center' }}>
                  <img
                    src={flatpakTargetImage.replace(/ /g, '%20')}
                    alt="Steam Properties Target Field Example"
                    style={{
                      maxWidth: '100%',
                      height: 'auto',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '4px'
                    }}
                  />
                </div>
              </Focusable>
            </div>
          </DialogControlsSection>

          {/* Close Button */}
          <DialogControlsSection>
            <PanelSectionRow>
              <ButtonItem
                layout="below"
                onClick={closeModal}
              >
                {t('FLATPAK_CLOSE', 'Close')}
              </ButtonItem>
            </PanelSectionRow>
          </DialogControlsSection>
        </Focusable>
      </DialogBody>
    </ModalRoot>
  );
};
