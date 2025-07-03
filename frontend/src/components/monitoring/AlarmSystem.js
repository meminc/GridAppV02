// frontend/src/components/monitoring/AlarmSystem.js

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Card,
    CardHeader,
    CardBody,
    VStack,
    HStack,
    Text,
    Badge,
    Button,
    IconButton,
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalFooter,
    ModalBody,
    ModalCloseButton,
    FormControl,
    FormLabel,
    Textarea,
    Select,
    Table,
    Thead,
    Tbody,
    Tr,
    Th,
    Td,
    TableContainer,
    useDisclosure,
    useToast,
    Flex,
    Heading,
    Input,
    InputGroup,
    InputLeftElement,
    Checkbox,
    Tooltip,
    AlertDialog,
    AlertDialogBody,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogContent,
    AlertDialogOverlay,
    Divider,
    Progress,
    Stat,
    StatLabel,
    StatNumber,
    StatHelpText,
} from '@chakra-ui/react';
import {
    AlertTriangle,
    CheckCircle,
    XCircle,
    MessageSquare,
    Search,
    Filter,
    Download,
    RefreshCw,
    Volume2,
    VolumeX,
    Clock,
    User,
    AlertCircle,
} from 'lucide-react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAuth } from '@/hooks/useAuth';

export default function AlarmSystem({ elementId = null, compact = false }) {
    const { user } = useAuth();
    const { alarms, acknowledgeAlarm, connected } = useWebSocket();
    const toast = useToast();

    const { isOpen, onOpen, onClose } = useDisclosure();
    const [selectedAlarm, setSelectedAlarm] = useState(null);
    const [ackComment, setAckComment] = useState('');
    const [isAcknowledging, setIsAcknowledging] = useState(false);

    // Filter states
    const [filterSeverity, setFilterSeverity] = useState('all');
    const [filterStatus, setFilterStatus] = useState('active');
    const [searchTerm, setSearchTerm] = useState('');
    const [soundEnabled, setSoundEnabled] = useState(false);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const alarmsPerPage = compact ? 5 : 20;

    // Audio for critical alarms
    const [audioContext, setAudioContext] = useState(null);

    useEffect(() => {
        // Initialize audio context for alarm sounds
        if (typeof window !== 'undefined' && !audioContext) {
            const context = new (window.AudioContext || window.webkitAudioContext)();
            setAudioContext(context);
        }
    }, [audioContext]);

    // Play alarm sound for critical alarms
    useEffect(() => {
        if (soundEnabled && audioContext && alarms.length > 0) {
            const latestAlarm = alarms[0];
            if (latestAlarm.severity === 'critical' && !latestAlarm.is_acknowledged) {
                playAlarmSound();
            }
        }
    }, [alarms, soundEnabled, audioContext]);

    const playAlarmSound = useCallback(() => {
        if (!audioContext) return;

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    }, [audioContext]);

    // Filter alarms based on criteria
    const filteredAlarms = alarms.filter(alarm => {
        // Element filter
        if (elementId && alarm.element_id !== elementId) return false;

        // Severity filter
        if (filterSeverity !== 'all' && alarm.severity !== filterSeverity) return false;

        // Status filter
        if (filterStatus === 'active' && !alarm.is_active) return false;
        if (filterStatus === 'acknowledged' && !alarm.is_acknowledged) return false;
        if (filterStatus === 'unacknowledged' && alarm.is_acknowledged) return false;

        // Search filter
        if (searchTerm && !alarm.message.toLowerCase().includes(searchTerm.toLowerCase()) &&
            !alarm.element_id.toLowerCase().includes(searchTerm.toLowerCase())) {
            return false;
        }

        return true;
    });

    // Pagination
    const totalPages = Math.ceil(filteredAlarms.length / alarmsPerPage);
    const startIndex = (currentPage - 1) * alarmsPerPage;
    const paginatedAlarms = filteredAlarms.slice(startIndex, startIndex + alarmsPerPage);

    // Statistics
    const stats = {
        total: alarms.length,
        active: alarms.filter(a => a.is_active).length,
        critical: alarms.filter(a => a.severity === 'critical' && a.is_active).length,
        acknowledged: alarms.filter(a => a.is_acknowledged).length,
    };

    const handleAcknowledge = async (alarm, comment = '') => {
        setIsAcknowledging(true);
        try {
            await acknowledgeAlarm(alarm.id, comment);
            toast({
                title: 'Alarm Acknowledged',
                description: `Alarm ${alarm.id} has been acknowledged`,
                status: 'success',
                duration: 3000,
            });
            onClose();
            setAckComment('');
        } catch (error) {
            toast({
                title: 'Acknowledgment Failed',
                description: error.message || 'Failed to acknowledge alarm',
                status: 'error',
                duration: 5000,
            });
        } finally {
            setIsAcknowledging(false);
        }
    };

    const openAckDialog = (alarm) => {
        setSelectedAlarm(alarm);
        onOpen();
    };

    const getSeverityColor = (severity) => {
        switch (severity) {
            case 'critical': return 'red';
            case 'warning': return 'orange';
            case 'info': return 'blue';
            default: return 'gray';
        }
    };

    const getSeverityIcon = (severity) => {
        switch (severity) {
            case 'critical': return XCircle;
            case 'warning': return AlertTriangle;
            case 'info': return AlertCircle;
            default: return AlertCircle;
        }
    };

    const exportAlarms = () => {
        const csv = [
            ['Timestamp', 'Element', 'Severity', 'Type', 'Message', 'Status', 'Acknowledged By'],
            ...filteredAlarms.map(alarm => [
                new Date(alarm.created_at).toISOString(),
                alarm.element_id,
                alarm.severity,
                alarm.alarm_type,
                alarm.message,
                alarm.is_active ? 'Active' : 'Resolved',
                alarm.acknowledged_by || 'N/A',
            ])
        ].map(row => row.join(',')).join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `alarms-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (compact) {
        return (
            <Card>
                <CardHeader pb={2}>
                    <HStack justify="space-between">
                        <Heading size="sm">Recent Alarms</Heading>
                        <Badge colorScheme="red" variant="subtle">
                            {stats.active} Active
                        </Badge>
                    </HStack>
                </CardHeader>
                <CardBody pt={2}>
                    <VStack align="stretch" spacing={2} maxH="300px" overflowY="auto">
                        {paginatedAlarms.length > 0 ? (
                            paginatedAlarms.map((alarm) => {
                                const SeverityIcon = getSeverityIcon(alarm.severity);
                                return (
                                    <Box
                                        key={alarm.id}
                                        p={2}
                                        bg="gray.50"
                                        borderRadius="md"
                                        borderLeft="3px solid"
                                        borderLeftColor={`${getSeverityColor(alarm.severity)}.500`}
                                    >
                                        <HStack justify="space-between" align="start">
                                            <HStack align="start" spacing={2}>
                                                <SeverityIcon
                                                    size={16}
                                                    color={`var(--chakra-colors-${getSeverityColor(alarm.severity)}-500)`}
                                                />
                                                <VStack align="start" spacing={0}>
                                                    <Text fontSize="sm" fontWeight="medium">
                                                        {alarm.message}
                                                    </Text>
                                                    <Text fontSize="xs" color="gray.600">
                                                        {alarm.element_id} • {new Date(alarm.created_at).toLocaleTimeString()}
                                                    </Text>
                                                </VStack>
                                            </HStack>
                                            {!alarm.is_acknowledged && (
                                                <Button
                                                    size="xs"
                                                    colorScheme="blue"
                                                    variant="outline"
                                                    onClick={() => openAckDialog(alarm)}
                                                >
                                                    ACK
                                                </Button>
                                            )}
                                        </HStack>
                                    </Box>
                                );
                            })
                        ) : (
                            <Box textAlign="center" py={4} color="gray.500">
                                <CheckCircle size={24} style={{ margin: '0 auto 8px' }} />
                                <Text fontSize="sm">No alarms match your filters</Text>
                            </Box>
                        )}
                    </VStack>
                </CardBody>

                {/* Acknowledge Modal */}
                <Modal isOpen={isOpen} onClose={onClose}>
                    <ModalOverlay />
                    <ModalContent>
                        <ModalHeader>Acknowledge Alarm</ModalHeader>
                        <ModalCloseButton />
                        <ModalBody>
                            {selectedAlarm && (
                                <VStack align="stretch" spacing={4}>
                                    <Box>
                                        <Text fontWeight="bold" mb={1}>Alarm Details:</Text>
                                        <Text fontSize="sm" color="gray.600">
                                            {selectedAlarm.message}
                                        </Text>
                                        <Text fontSize="xs" color="gray.500" mt={1}>
                                            Element: {selectedAlarm.element_id} •
                                            Severity: {selectedAlarm.severity} •
                                            {new Date(selectedAlarm.created_at).toLocaleString()}
                                        </Text>
                                    </Box>
                                    <FormControl>
                                        <FormLabel>Comment (Optional)</FormLabel>
                                        <Textarea
                                            value={ackComment}
                                            onChange={(e) => setAckComment(e.target.value)}
                                            placeholder="Add a comment about this acknowledgment..."
                                            rows={3}
                                        />
                                    </FormControl>
                                </VStack>
                            )}
                        </ModalBody>
                        <ModalFooter>
                            <Button variant="ghost" mr={3} onClick={onClose}>
                                Cancel
                            </Button>
                            <Button
                                colorScheme="blue"
                                onClick={() => handleAcknowledge(selectedAlarm, ackComment)}
                                isLoading={isAcknowledging}
                            >
                                Acknowledge
                            </Button>
                        </ModalFooter>
                    </ModalContent>
                </Modal>
            </Card>
        );
    }

    // Full alarm system view
    return (
        <Box>
            {/* Statistics */}
            <Grid templateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap={4} mb={6}>
                <Stat>
                    <StatLabel>Total Alarms</StatLabel>
                    <StatNumber>{stats.total}</StatNumber>
                    <StatHelpText>All time</StatHelpText>
                </Stat>
                <Stat>
                    <StatLabel>Active Alarms</StatLabel>
                    <StatNumber color="red.500">{stats.active}</StatNumber>
                    <StatHelpText>Requiring attention</StatHelpText>
                </Stat>
                <Stat>
                    <StatLabel>Critical Alarms</StatLabel>
                    <StatNumber color="red.600">{stats.critical}</StatNumber>
                    <StatHelpText>High priority</StatHelpText>
                </Stat>
                <Stat>
                    <StatLabel>Acknowledged</StatLabel>
                    <StatNumber color="green.500">{stats.acknowledged}</StatNumber>
                    <StatHelpText>Handled</StatHelpText>
                </Stat>
            </Grid>

            <Card>
                <CardHeader>
                    <Flex justify="space-between" align="center" wrap="wrap" gap={4}>
                        <Heading size="md">Alarm Management</Heading>

                        <HStack spacing={2}>
                            <Tooltip label={soundEnabled ? "Disable alarm sounds" : "Enable alarm sounds"}>
                                <IconButton
                                    icon={soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                                    onClick={() => setSoundEnabled(!soundEnabled)}
                                    variant="outline"
                                    size="sm"
                                    colorScheme={soundEnabled ? "green" : "gray"}
                                />
                            </Tooltip>

                            <Button
                                leftIcon={<Download size={16} />}
                                onClick={exportAlarms}
                                size="sm"
                                variant="outline"
                            >
                                Export
                            </Button>

                            <Badge colorScheme={connected ? 'green' : 'red'}>
                                {connected ? 'LIVE' : 'OFFLINE'}
                            </Badge>
                        </HStack>
                    </Flex>
                </CardHeader>

                <CardBody>
                    {/* Filters */}
                    <VStack align="stretch" spacing={4} mb={6}>
                        <HStack spacing={4} wrap="wrap">
                            <InputGroup maxW="300px">
                                <InputLeftElement>
                                    <Search size={16} color="gray" />
                                </InputLeftElement>
                                <Input
                                    placeholder="Search alarms..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </InputGroup>

                            <Select
                                value={filterSeverity}
                                onChange={(e) => setFilterSeverity(e.target.value)}
                                maxW="150px"
                            >
                                <option value="all">All Severities</option>
                                <option value="critical">Critical</option>
                                <option value="warning">Warning</option>
                                <option value="info">Info</option>
                            </Select>

                            <Select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                maxW="150px"
                            >
                                <option value="all">All Status</option>
                                <option value="active">Active</option>
                                <option value="acknowledged">Acknowledged</option>
                                <option value="unacknowledged">Unacknowledged</option>
                            </Select>
                        </HStack>

                        {(searchTerm || filterSeverity !== 'all' || filterStatus !== 'all') && (
                            <HStack>
                                <Text fontSize="sm" color="gray.600">
                                    Showing {filteredAlarms.length} of {alarms.length} alarms
                                </Text>
                                <Button
                                    size="xs"
                                    variant="ghost"
                                    onClick={() => {
                                        setSearchTerm('');
                                        setFilterSeverity('all');
                                        setFilterStatus('all');
                                    }}
                                >
                                    Clear Filters
                                </Button>
                            </HStack>
                        )}
                    </VStack>

                    {/* Alarms Table */}
                    <TableContainer>
                        <Table variant="simple" size="sm">
                            <Thead>
                                <Tr>
                                    <Th>Severity</Th>
                                    <Th>Element</Th>
                                    <Th>Type</Th>
                                    <Th>Message</Th>
                                    <Th>Time</Th>
                                    <Th>Status</Th>
                                    <Th>Actions</Th>
                                </Tr>
                            </Thead>
                            <Tbody>
                                {paginatedAlarms.map((alarm) => {
                                    const SeverityIcon = getSeverityIcon(alarm.severity);
                                    return (
                                        <Tr key={alarm.id} opacity={alarm.is_active ? 1 : 0.6}>
                                            <Td>
                                                <HStack>
                                                    <SeverityIcon
                                                        size={16}
                                                        color={`var(--chakra-colors-${getSeverityColor(alarm.severity)}-500)`}
                                                    />
                                                    <Badge
                                                        colorScheme={getSeverityColor(alarm.severity)}
                                                        size="sm"
                                                    >
                                                        {alarm.severity.toUpperCase()}
                                                    </Badge>
                                                </HStack>
                                            </Td>
                                            <Td>
                                                <Text fontFamily="mono" fontSize="sm">
                                                    {alarm.element_id}
                                                </Text>
                                            </Td>
                                            <Td>
                                                <Text fontSize="sm">{alarm.alarm_type}</Text>
                                            </Td>
                                            <Td>
                                                <Text fontSize="sm" maxW="300px" noOfLines={2}>
                                                    {alarm.message}
                                                </Text>
                                            </Td>
                                            <Td>
                                                <VStack align="start" spacing={0}>
                                                    <Text fontSize="xs">
                                                        {new Date(alarm.created_at).toLocaleDateString()}
                                                    </Text>
                                                    <Text fontSize="xs" color="gray.500">
                                                        {new Date(alarm.created_at).toLocaleTimeString()}
                                                    </Text>
                                                </VStack>
                                            </Td>
                                            <Td>
                                                <VStack align="start" spacing={1}>
                                                    <Badge
                                                        colorScheme={alarm.is_active ? 'red' : 'gray'}
                                                        size="sm"
                                                    >
                                                        {alarm.is_active ? 'Active' : 'Resolved'}
                                                    </Badge>
                                                    {alarm.is_acknowledged && (
                                                        <Badge colorScheme="green" size="sm">
                                                            Acknowledged
                                                        </Badge>
                                                    )}
                                                </VStack>
                                            </Td>
                                            <Td>
                                                <HStack spacing={1}>
                                                    {!alarm.is_acknowledged && (
                                                        <Tooltip label="Acknowledge Alarm">
                                                            <IconButton
                                                                icon={<CheckCircle size={16} />}
                                                                size="sm"
                                                                colorScheme="green"
                                                                variant="outline"
                                                                onClick={() => openAckDialog(alarm)}
                                                            />
                                                        </Tooltip>
                                                    )}
                                                    {alarm.is_acknowledged && (
                                                        <Tooltip label={`Acknowledged by ${alarm.acknowledged_by} at ${new Date(alarm.acknowledged_at).toLocaleString()}`}>
                                                            <IconButton
                                                                icon={<User size={16} />}
                                                                size="sm"
                                                                variant="ghost"
                                                                colorScheme="gray"
                                                            />
                                                        </Tooltip>
                                                    )}
                                                </HStack>
                                            </Td>
                                        </Tr>
                                    );
                                })}
                            </Tbody>
                        </Table>
                    </TableContainer>

                    {filteredAlarms.length === 0 && (
                        <Box textAlign="center" py={8}>
                            <CheckCircle size={48} style={{ margin: '0 auto 16px', color: 'var(--chakra-colors-gray-400)' }} />
                            <Text color="gray.500" fontSize="lg">No alarms found</Text>
                            <Text color="gray.400" fontSize="sm">
                                {alarms.length === 0 ? 'No alarms have been generated yet' : 'Try adjusting your filters'}
                            </Text>
                        </Box>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <Flex justify="space-between" align="center" mt={6}>
                            <Text fontSize="sm" color="gray.600">
                                Showing {startIndex + 1}-{Math.min(startIndex + alarmsPerPage, filteredAlarms.length)} of {filteredAlarms.length}
                            </Text>
                            <HStack>
                                <Button
                                    size="sm"
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    isDisabled={currentPage === 1}
                                >
                                    Previous
                                </Button>
                                <Text fontSize="sm">
                                    Page {currentPage} of {totalPages}
                                </Text>
                                <Button
                                    size="sm"
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    isDisabled={currentPage === totalPages}
                                >
                                    Next
                                </Button>
                            </HStack>
                        </Flex>
                    )}
                </CardBody>
            </Card>

            {/* Acknowledge Modal */}
            <Modal isOpen={isOpen} onClose={onClose} size="md">
                <ModalOverlay />
                <ModalContent>
                    <ModalHeader>Acknowledge Alarm</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody>
                        {selectedAlarm && (
                            <VStack align="stretch" spacing={4}>
                                <Box p={4} bg="gray.50" borderRadius="md">
                                    <HStack mb={2}>
                                        <Badge colorScheme={getSeverityColor(selectedAlarm.severity)}>
                                            {selectedAlarm.severity.toUpperCase()}
                                        </Badge>
                                        <Text fontSize="sm" color="gray.600">
                                            {selectedAlarm.element_id}
                                        </Text>
                                    </HStack>
                                    <Text fontWeight="medium" mb={1}>
                                        {selectedAlarm.message}
                                    </Text>
                                    <Text fontSize="sm" color="gray.600">
                                        Type: {selectedAlarm.alarm_type}
                                    </Text>
                                    <Text fontSize="sm" color="gray.600">
                                        Created: {new Date(selectedAlarm.created_at).toLocaleString()}
                                    </Text>
                                </Box>

                                <FormControl>
                                    <FormLabel>Comment</FormLabel>
                                    <Textarea
                                        value={ackComment}
                                        onChange={(e) => setAckComment(e.target.value)}
                                        placeholder="Add a comment about this acknowledgment (optional)..."
                                        rows={4}
                                    />
                                </FormControl>

                                <Box p={3} bg="blue.50" borderRadius="md" fontSize="sm">
                                    <HStack>
                                        <User size={16} />
                                        <Text>
                                            This alarm will be acknowledged by <strong>{user?.firstName} {user?.lastName}</strong>
                                        </Text>
                                    </HStack>
                                </Box>
                            </VStack>
                        )}
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="ghost" mr={3} onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            colorScheme="blue"
                            onClick={() => handleAcknowledge(selectedAlarm, ackComment)}
                            isLoading={isAcknowledging}
                            leftIcon={<CheckCircle size={16} />}
                        >
                            Acknowledge
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </Box>
    );
}