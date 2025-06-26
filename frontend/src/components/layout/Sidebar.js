import { Box, VStack, Button, Text } from '@chakra-ui/react';
import { useRouter } from 'next/navigation';
import {
    LayoutDashboard,
    Network,
    Zap,
    FileText,
    Users,
    Settings,
} from 'lucide-react';

const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
    { icon: Network, label: 'Network', path: '/network' },
    { icon: Zap, label: 'Simulations', path: '/simulations' },
    { icon: FileText, label: 'Scenarios', path: '/scenarios' },
    { icon: Users, label: 'Users', path: '/users' },
    { icon: Settings, label: 'Settings', path: '/settings' },
];

export default function Sidebar() {
    const router = useRouter();

    return (
        <Box bg="gray.800" w="250px" p={4}>
            <VStack spacing={2} align="stretch">
                {menuItems.map((item) => {
                    const Icon = item.icon;
                    return (
                        <Button
                            key={item.path}
                            leftIcon={<Icon size={20} />}
                            variant="ghost"
                            justifyContent="flex-start"
                            color="gray.300"
                            _hover={{ bg: 'gray.700', color: 'white' }}
                            onClick={() => router.push(item.path)}
                        >
                            {item.label}
                        </Button>
                    );
                })}
            </VStack>
        </Box>
    );
}